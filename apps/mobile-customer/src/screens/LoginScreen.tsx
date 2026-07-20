import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthStore } from '@aagam/mobile-shared';
import { ArrowRight, Chrome, Lock, Mail, Phone, ShieldCheck, User } from 'lucide-react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '@env';
import type { CustomerPhoneOtpPurpose } from '../auth/customerPhoneOtpFlow';
import {
  createAsyncRequestLock,
  discoverCustomerPhoneOtp,
  resendCustomerPhoneOtp,
} from '../auth/customerPhoneOtpFlow';
import { getUserSafeError, notify } from '../ui/notify';

const googleClientConfigured =
  typeof GOOGLE_WEB_CLIENT_ID === 'string' &&
  GOOGLE_WEB_CLIENT_ID.endsWith('.apps.googleusercontent.com');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const phoneForApi = (value: string) => {
  const compact = value.replace(/[\s().-]/g, '');
  if (/^\d{10}$/.test(compact)) return `+91${compact}`;
  if (/^91\d{10}$/.test(compact)) return `+${compact}`;
  return compact;
};

export const LoginScreen = () => {
  const login = useAuthStore((state) => state.login);
  const requestPhoneOtp = useAuthStore((state) => state.requestPhoneOtp);
  const verifyPhoneOtp = useAuthStore((state) => state.verifyPhoneOtp);
  const googleLogin = useAuthStore((state) => state.googleLogin);
  const otpInputRef = useRef<TextInput>(null);
  const profileNameRef = useRef<TextInput>(null);
  const requestLock = useRef(createAsyncRequestLock()).current;
  const verificationLock = useRef(createAsyncRequestLock()).current;
  const [mode, setMode] = useState<'PHONE' | 'PASSWORD'>('PHONE');
  const [phone, setPhone] = useState('');
  const [masked, setMasked] = useState('');
  const [code, setCode] = useState('');
  const [otpPurpose, setOtpPurpose] = useState<CustomerPhoneOtpPurpose | null>(null);
  const [newCustomer, setNewCustomer] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (googleClientConfigured) {
      GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, offlineAccess: false });
    }
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(
      () => setCountdown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [countdown]);

  const validateProfile = (showFeedback = true) => {
    if (!newCustomer) return true;
    if (profileName.trim().length < 2) {
      if (showFeedback) {
        notify.warning(
          'Full name required',
          'Enter at least 2 characters to create your account.',
        );
        profileNameRef.current?.focus();
      }
      return false;
    }
    if (profileEmail.trim() && !emailPattern.test(profileEmail.trim())) {
      if (showFeedback) {
        notify.warning(
          'Invalid email',
          'Enter a valid email address or leave it blank.',
        );
      }
      return false;
    }
    return true;
  };

  const applyChallenge = (
    normalizedPhone: string,
    resolvedPurpose: CustomerPhoneOtpPurpose,
    isNewCustomer: boolean,
    maskedDestination: string,
  ) => {
    setPhone(normalizedPhone);
    setMasked(maskedDestination);
    setOtpPurpose(resolvedPurpose);
    setNewCustomer(isNewCustomer);
    setCode('');
    setCountdown(30);
    setTimeout(() => {
      if (isNewCustomer) profileNameRef.current?.focus();
      else otpInputRef.current?.focus();
    }, 250);
  };

  const requestCode = async () => {
    const normalized = phoneForApi(phone);
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      notify.warning(
        'Valid mobile required',
        'Enter a 10-digit Indian mobile number or a valid E.164 number.',
      );
      return;
    }

    await requestLock.run(async () => {
      setRequesting(true);
      try {
        const result = await discoverCustomerPhoneOtp(requestPhoneOtp, normalized);
        applyChallenge(
          normalized,
          result.purpose,
          result.isNewCustomer,
          result.challenge.maskedDestination,
        );
        notify.success('OTP sent', `Code sent to ${result.challenge.maskedDestination}.`);
      } catch (error) {
        notify.error('Could not send OTP', getUserSafeError(error, 'Please try again.'));
      } finally {
        setRequesting(false);
      }
    });
  };

  const resendCode = async () => {
    if (!otpPurpose || countdown > 0) return;
    await requestLock.run(async () => {
      setRequesting(true);
      try {
        const result = await resendCustomerPhoneOtp(requestPhoneOtp, phone, otpPurpose);
        setMasked(result.maskedDestination);
        setCode('');
        setCountdown(30);
        notify.success('OTP resent', `A new code was sent to ${result.maskedDestination}.`);
        setTimeout(() => otpInputRef.current?.focus(), 180);
      } catch (error) {
        notify.error(
          'Could not resend OTP',
          getUserSafeError(error, 'Please try again.'),
        );
      } finally {
        setRequesting(false);
      }
    });
  };

  const verifyCode = async (candidate = code) => {
    if (!otpPurpose || !/^\d{6}$/.test(candidate)) return;
    if (!validateProfile()) return;

    await verificationLock.run(async () => {
      setVerifying(true);
      try {
        await verifyPhoneOtp({
          phoneE164: phone,
          purpose: otpPurpose,
          code: candidate,
          ...(otpPurpose === 'SIGNUP'
            ? {
                name: profileName.trim(),
                email: profileEmail.trim() || undefined,
              }
            : {}),
        });
        if (otpPurpose === 'SIGNUP') {
          notify.success('Account created successfully', 'Welcome to AAGAM.');
        } else {
          notify.success('Signed in successfully', 'Welcome back to AAGAM.');
        }
      } catch (error) {
        setCode('');
        notify.error(
          'Code not verified',
          getUserSafeError(
            error,
            'The OTP is wrong or expired. Request a new code and try again.',
          ),
        );
        setTimeout(() => otpInputRef.current?.focus(), 100);
      } finally {
        setVerifying(false);
      }
    });
  };

  const updateCode = (value: string) => {
    const next = value.replace(/\D/g, '').slice(0, 6);
    setCode(next);
    if (next.length === 6 && otpPurpose && validateProfile(false)) {
      setTimeout(() => void verifyCode(next), 100);
    }
  };

  const resetPhoneFlow = () => {
    setMasked('');
    setCode('');
    setOtpPurpose(null);
    setNewCustomer(false);
    setProfileName('');
    setProfileEmail('');
    setCountdown(0);
    setRequesting(false);
    setVerifying(false);
    requestLock.reset();
    verificationLock.reset();
  };

  const passwordLogin = async () => {
    if (!identifier.trim() || !password) {
      notify.warning('Missing details', 'Enter your phone/email and password.');
      return;
    }
    setPasswordLoading(true);
    try {
      await login(identifier.trim(), password);
      notify.success('Signed in successfully', 'Welcome back to AAGAM.');
    } catch (error) {
      notify.error(
        'Login failed',
        getUserSafeError(error, 'Check your credentials and try again.'),
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!googleClientConfigured) {
      notify.info(
        'Google Sign-In unavailable',
        'Install a verified Customer APK to use Google Sign-In.',
      );
      return;
    }
    try {
      setGoogleLoading(true);
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken || (response as any)?.idToken;
      if (!idToken) throw new Error('Google token missing');
      await googleLogin(idToken);
      notify.success('Signed in successfully', 'Your Google account is connected.');
    } catch (error: any) {
      if (error?.code !== statusCodes.SIGN_IN_CANCELLED) {
        notify.error(
          'Google Sign-In failed',
          getUserSafeError(error, 'Please try again.'),
        );
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const phoneBusy = requesting || verifying;
  const challengeTitle = newCustomer ? 'Create your account' : 'Verify your number';
  const challengeSubtitle = newCustomer
    ? 'This is a new mobile number. Complete your profile and enter the OTP.'
    : 'This mobile number already has an AAGAM account. Enter the OTP to sign in.';

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logo}><Text style={styles.logoText}>A</Text></View>
            <Text style={styles.title}>AAGAM</Text>
            <Text style={styles.subtitle}>Fast, secure Customer access</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{masked ? challengeTitle : 'Customer access'}</Text>
            <Text style={styles.cardSubtitle}>
              {masked
                ? challengeSubtitle
                : 'Use one mobile number for both first-time signup and returning login.'}
            </Text>

            {!masked ? (
              <View style={styles.tabs}>
                <TouchableOpacity
                  onPress={() => setMode('PHONE')}
                  style={[styles.tab, mode === 'PHONE' && styles.tabActive]}
                >
                  <Phone size={17} color={mode === 'PHONE' ? '#fff' : '#64748B'} />
                  <Text style={[styles.tabText, mode === 'PHONE' && styles.tabTextActive]}>
                    Phone OTP
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setMode('PASSWORD')}
                  style={[styles.tab, mode === 'PASSWORD' && styles.tabActive]}
                >
                  <Lock size={17} color={mode === 'PASSWORD' ? '#fff' : '#64748B'} />
                  <Text style={[styles.tabText, mode === 'PASSWORD' && styles.tabTextActive]}>
                    Password
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {mode === 'PHONE' ? (
              !masked ? (
                <>
                  <View style={styles.infoPanel}>
                    <ShieldCheck size={18} color="#0F766E" />
                    <Text style={styles.infoText}>
                      New customers receive a signup OTP automatically. Existing customers receive a login OTP.
                    </Text>
                  </View>
                  <View style={styles.inputWrapper}>
                    <Phone size={19} color="#0F766E" />
                    <TextInput
                      style={styles.input}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="10-digit mobile number"
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.primary, requesting && styles.buttonDisabled]}
                    onPress={requestCode}
                    disabled={requesting}
                  >
                    {requesting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.primaryText}>Continue with OTP</Text>
                        <ArrowRight size={19} color="#fff" />
                      </>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={[styles.customerBadge, newCustomer ? styles.newBadge : styles.existingBadge]}>
                    <Text style={styles.customerBadgeText}>
                      {newCustomer ? 'NEW CUSTOMER' : 'EXISTING CUSTOMER'}
                    </Text>
                  </View>
                  <Text style={styles.sent}>Code sent to {masked}</Text>

                  {newCustomer ? (
                    <View style={styles.profilePanel}>
                      <Text style={styles.profileTitle}>Complete your profile</Text>
                      <Text style={styles.profileHelp}>
                        Full name is required. Email is optional.
                      </Text>
                      <View style={styles.profileInputRow}>
                        <User size={18} color="#0F766E" />
                        <TextInput
                          ref={profileNameRef}
                          style={styles.profileInput}
                          value={profileName}
                          onChangeText={setProfileName}
                          placeholder="Full name"
                          autoCapitalize="words"
                          returnKeyType="next"
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                      <View style={styles.profileInputRow}>
                        <Mail size={18} color="#64748B" />
                        <TextInput
                          style={styles.profileInput}
                          value={profileEmail}
                          onChangeText={setProfileEmail}
                          placeholder="Email (optional)"
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          returnKeyType="done"
                          onSubmitEditing={() => otpInputRef.current?.focus()}
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                    </View>
                  ) : null}

                  <Text style={styles.otpLabel}>Enter six-digit OTP</Text>
                  <TouchableOpacity
                    style={styles.otpRow}
                    onPress={() => otpInputRef.current?.focus()}
                    activeOpacity={0.8}
                  >
                    {Array.from({ length: 6 }).map((_, index) => (
                      <View
                        key={index}
                        style={[styles.otpCell, code.length === index && styles.otpActive]}
                      >
                        <Text style={styles.otpDigit}>{code[index] || ''}</Text>
                      </View>
                    ))}
                  </TouchableOpacity>
                  <TextInput
                    ref={otpInputRef}
                    value={code}
                    onChangeText={updateCode}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    maxLength={6}
                    style={styles.hiddenOtpInput}
                  />
                  <TouchableOpacity
                    style={[styles.primary, (phoneBusy || code.length !== 6) && styles.buttonDisabled]}
                    onPress={() => verifyCode()}
                    disabled={phoneBusy || code.length !== 6}
                  >
                    {verifying ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryText}>
                        {otpPurpose === 'SIGNUP'
                          ? 'Verify and create account'
                          : 'Verify and sign in'}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={countdown > 0 || requesting}
                    onPress={() => void resendCode()}
                  >
                    <Text
                      style={[
                        styles.link,
                        (countdown > 0 || requesting) && styles.linkDisabled,
                      ]}
                    >
                      {countdown > 0
                        ? `Resend in 00:${String(countdown).padStart(2, '0')}`
                        : requesting
                          ? 'Sending…'
                          : 'Resend OTP'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={phoneBusy} onPress={resetPhoneFlow}>
                    <Text style={styles.secondaryLink}>Change mobile number</Text>
                  </TouchableOpacity>
                </>
              )
            ) : (
              <>
                <View style={styles.inputWrapper}>
                  <Mail size={19} color="#64748B" />
                  <TextInput
                    style={styles.input}
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder="Phone number or email"
                    autoCapitalize="none"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={styles.inputWrapper}>
                  <Lock size={19} color="#64748B" />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    secureTextEntry
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <TouchableOpacity
                  style={[styles.primary, passwordLoading && styles.buttonDisabled]}
                  onPress={passwordLogin}
                  disabled={passwordLoading}
                >
                  {passwordLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>Continue</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {!masked ? (
              <>
                <View style={styles.divider}>
                  <View style={styles.line} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.line} />
                </View>
                <TouchableOpacity
                  style={styles.google}
                  onPress={handleGoogleLogin}
                  disabled={googleLoading || !googleClientConfigured}
                >
                  {googleLoading ? (
                    <ActivityIndicator />
                  ) : (
                    <>
                      <Chrome size={21} color="#1E293B" />
                      <Text style={styles.googleText}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : null}
          </View>

          <View style={styles.secure}>
            <ShieldCheck size={16} color="#15803D" />
            <Text style={styles.secureText}>
              OTP codes are single-use and expire after 10 minutes.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  keyboardView: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 48,
    justifyContent: 'center',
  },
  header: { alignItems: 'center', marginBottom: 20 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#fff', fontSize: 30, fontWeight: '900' },
  title: { marginTop: 10, fontSize: 28, fontWeight: '900', color: '#0F172A' },
  subtitle: { color: '#64748B', fontWeight: '700' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 22,
    gap: 14,
    elevation: 4,
  },
  cardTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', textAlign: 'center' },
  cardSubtitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  tabs: { flexDirection: 'row', borderRadius: 14, backgroundColor: '#F1F5F9', padding: 4 },
  tab: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: '#0F766E' },
  tabText: { color: '#64748B', fontWeight: '900' },
  tabTextActive: { color: '#fff' },
  infoPanel: {
    flexDirection: 'row',
    gap: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#99F6E4',
    backgroundColor: '#F0FDFA',
    padding: 12,
  },
  infoText: { flex: 1, color: '#115E59', fontSize: 12, fontWeight: '700', lineHeight: 18 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 55,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
  },
  input: { flex: 1, marginLeft: 9, color: '#0F172A', fontSize: 15 },
  primary: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#0F766E',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.55 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  customerBadge: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  newBadge: { backgroundColor: '#CCFBF1' },
  existingBadge: { backgroundColor: '#DBEAFE' },
  customerBadgeText: { color: '#134E4A', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  sent: { textAlign: 'center', color: '#475569', fontWeight: '800' },
  profilePanel: {
    gap: 9,
    padding: 13,
    borderRadius: 16,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  profileTitle: { fontSize: 16, fontWeight: '900', color: '#134E4A' },
  profileHelp: { color: '#0F766E', fontSize: 12, fontWeight: '700' },
  profileInputRow: {
    minHeight: 50,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileInput: { flex: 1, color: '#0F172A' },
  otpLabel: { color: '#334155', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  otpRow: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  otpCell: {
    flex: 1,
    height: 54,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpActive: { borderColor: '#14B8A6', backgroundColor: '#F0FDFA' },
  otpDigit: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
  hiddenOtpInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  link: { color: '#0F766E', textAlign: 'center', fontWeight: '900' },
  linkDisabled: { color: '#94A3B8' },
  secondaryLink: { color: '#64748B', textAlign: 'center', fontWeight: '800' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 2 },
  line: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { marginHorizontal: 12, color: '#94A3B8', fontWeight: '700' },
  google: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleText: { fontWeight: '900', color: '#1E293B' },
  secure: { marginTop: 16, flexDirection: 'row', gap: 7, justifyContent: 'center' },
  secureText: { flexShrink: 1, color: '#15803D', fontSize: 11, fontWeight: '700' },
});
