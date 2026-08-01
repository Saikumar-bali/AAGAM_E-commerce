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
import { ArrowRight, Chrome, Eye, Lock, Mail, Phone, ShieldCheck, User } from 'lucide-react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '@env';
import type { CustomerPhoneOtpPurpose } from '../auth/customerPhoneOtpFlow';
import {
  createAsyncRequestLock,
  discoverCustomerPhoneOtp,
  resendCustomerPhoneOtp,
} from '../auth/customerPhoneOtpFlow';
import { AagamBrand } from '../components/AagamBrand';
import { getUserSafeError, notify } from '../ui/notify';

const googleClientConfigured =
  typeof GOOGLE_WEB_CLIENT_ID === 'string' &&
  GOOGLE_WEB_CLIENT_ID.endsWith('.apps.googleusercontent.com');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 10);
const phoneForApi = (value: string) => `+91${digitsOnly(value)}`;

export const LoginScreen = () => {
  const login = useAuthStore((state) => state.login);
  const requestPhoneOtp = useAuthStore((state) => state.requestPhoneOtp);
  const verifyPhoneOtp = useAuthStore((state) => state.verifyPhoneOtp);
  const googleLogin = useAuthStore((state) => state.googleLogin);
  const otpInputRef = useRef<TextInput>(null);
  const profileNameRef = useRef<TextInput>(null);
  const requestLock = useRef(createAsyncRequestLock()).current;
  const verificationLock = useRef(createAsyncRequestLock()).current;
  const [mode, setMode] = useState<'PHONE' | 'PASSWORD'>('PASSWORD');
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
  const [showPassword, setShowPassword] = useState(false);
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
    const timer = setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const validateProfile = (showFeedback = true) => {
    if (!newCustomer) return true;
    if (profileName.trim().length < 2) {
      if (showFeedback) notify.warning('Full name required', 'Enter at least 2 characters to create your account.');
      profileNameRef.current?.focus();
      return false;
    }
    if (profileEmail.trim() && !emailPattern.test(profileEmail.trim())) {
      if (showFeedback) notify.warning('Invalid email', 'Enter a valid email address or leave it blank.');
      return false;
    }
    return true;
  };

  const applyChallenge = (
    nationalNumber: string,
    resolvedPurpose: CustomerPhoneOtpPurpose,
    isNewCustomer: boolean,
    maskedDestination: string,
  ) => {
    setPhone(nationalNumber);
    setMasked(maskedDestination);
    setOtpPurpose(resolvedPurpose);
    setNewCustomer(isNewCustomer);
    setCode('');
    setCountdown(30);
    setTimeout(() => (isNewCustomer ? profileNameRef.current : otpInputRef.current)?.focus(), 250);
  };

  const requestCode = async () => {
    const nationalNumber = digitsOnly(phone);
    if (nationalNumber.length !== 10) {
      notify.warning('Valid mobile required', 'Enter exactly 10 digits.');
      return;
    }
    const normalized = phoneForApi(nationalNumber);
    await requestLock.run(async () => {
      setRequesting(true);
      try {
        const result = await discoverCustomerPhoneOtp(requestPhoneOtp, normalized);
        applyChallenge(nationalNumber, result.purpose, result.isNewCustomer, result.challenge.maskedDestination);
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
        const result = await resendCustomerPhoneOtp(requestPhoneOtp, phoneForApi(phone), otpPurpose);
        setMasked(result.maskedDestination);
        setCode('');
        setCountdown(30);
        notify.success('OTP resent', `A new code was sent to ${result.maskedDestination}.`);
        setTimeout(() => otpInputRef.current?.focus(), 180);
      } catch (error) {
        notify.error('Could not resend OTP', getUserSafeError(error, 'Please try again.'));
      } finally {
        setRequesting(false);
      }
    });
  };

  const verifyCode = async (candidate = code) => {
    if (!otpPurpose || !/^\d{6}$/.test(candidate) || !validateProfile()) return;
    await verificationLock.run(async () => {
      setVerifying(true);
      try {
        await verifyPhoneOtp({
          phoneE164: phoneForApi(phone),
          purpose: otpPurpose,
          code: candidate,
          ...(otpPurpose === 'SIGNUP'
            ? { name: profileName.trim(), email: profileEmail.trim() || undefined }
            : {}),
        });
        notify.success(
          otpPurpose === 'SIGNUP' ? 'Account created successfully' : 'Signed in successfully',
          otpPurpose === 'SIGNUP' ? 'Welcome to Aagaam.' : 'Welcome back to Aagaam.',
        );
      } catch (error) {
        setCode('');
        notify.error('Code not verified', getUserSafeError(error, 'The OTP is wrong or expired. Request a new code and try again.'));
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
      notify.success('Signed in successfully', 'Welcome back to Aagaam.');
    } catch (error) {
      notify.error('Login failed', getUserSafeError(error, 'Check your credentials and try again.'));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!googleClientConfigured) {
      notify.info('Google Sign-In unavailable', 'Install a verified Customer APK to use Google Sign-In.');
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
        notify.error('Google Sign-In failed', getUserSafeError(error, 'Please try again.'));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const phoneBusy = requesting || verifying;
  const challengeTitle = newCustomer ? 'Complete your account' : 'Verify your mobile number';

  return (
    <View style={styles.container}>
      <View style={styles.glowTeal} />
      <View style={styles.glowAmber} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}><AagamBrand /><Text style={styles.brandName}>Aagaam</Text><Text style={styles.brandCaption}>SHOPPING MADE EFFORTLESS</Text><Text style={styles.subtitle}>Fast access. Secure checkout. Live delivery updates.</Text></View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{masked ? challengeTitle : 'Welcome to Aagaam'}</Text>
            <Text style={styles.cardSubtitle}>{masked ? 'Enter your details and the OTP sent to your mobile number.' : 'Use your phone number or email to continue.'}</Text>
            {!masked ? <View style={styles.tabs}>
              <TouchableOpacity onPress={() => setMode('PHONE')} style={[styles.tab, mode === 'PHONE' && styles.tabActive]}><Phone size={17} color={mode === 'PHONE' ? '#fff' : '#64748B'} /><Text style={[styles.tabText, mode === 'PHONE' && styles.tabTextActive]}>Phone OTP</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setMode('PASSWORD')} style={[styles.tab, mode === 'PASSWORD' && styles.tabActive]}><Lock size={17} color={mode === 'PASSWORD' ? '#fff' : '#64748B'} /><Text style={[styles.tabText, mode === 'PASSWORD' && styles.tabTextActive]}>Password</Text></TouchableOpacity>
            </View> : null}

            {mode === 'PHONE' ? !masked ? <>
              <View style={styles.infoPanel}><ShieldCheck size={18} color="#0F766E" /><Text style={styles.infoText}>A single-use OTP keeps your account protected.</Text></View>
              <Text style={styles.label}>Mobile number</Text>
              <View style={styles.inputWrapper}><View style={styles.countryCode}><Text style={styles.countryCodeText}>+91</Text></View><TextInput testID="customer_phone_input" style={styles.input} value={phone} onChangeText={(value) => setPhone(digitsOnly(value))} placeholder="10-digit mobile number" keyboardType="number-pad" autoComplete="tel-national" textContentType="telephoneNumber" maxLength={10} placeholderTextColor="#94A3B8" /></View>
              <TouchableOpacity style={[styles.primary, (requesting || phone.length !== 10) && styles.buttonDisabled]} onPress={requestCode} disabled={requesting || phone.length !== 10}>{requesting ? <ActivityIndicator color="#fff" /> : <><Text style={styles.primaryText}>Continue with OTP</Text><ArrowRight size={19} color="#fff" /></>}</TouchableOpacity>
            </> : <>
              <Text style={styles.sent}>Code sent to {masked}</Text>
              {newCustomer ? <View style={styles.profilePanel}><Text style={styles.profileTitle}>Complete your profile</Text><Text style={styles.profileHelp}>Full name is required. Email is optional.</Text><View style={styles.inputWrapper}><User size={18} color="#0F766E" /><TextInput ref={profileNameRef} style={styles.input} value={profileName} onChangeText={setProfileName} placeholder="Full name" autoCapitalize="words" placeholderTextColor="#94A3B8" /></View><View style={styles.inputWrapper}><Mail size={18} color="#64748B" /><TextInput style={styles.input} value={profileEmail} onChangeText={setProfileEmail} placeholder="Email (optional)" keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#94A3B8" /></View></View> : null}
              <Text style={styles.otpLabel}>Enter the 6-digit OTP</Text>
              <TouchableOpacity style={styles.otpRow} onPress={() => otpInputRef.current?.focus()}>{Array.from({ length: 6 }).map((_, index) => <View key={index} style={[styles.otpCell, code.length === index && styles.otpActive]}><Text style={styles.otpDigit}>{code[index] || ''}</Text></View>)}</TouchableOpacity>
              <TextInput ref={otpInputRef} value={code} onChangeText={updateCode} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} style={styles.hiddenOtpInput} />
              <TouchableOpacity style={[styles.primary, (phoneBusy || code.length !== 6) && styles.buttonDisabled]} onPress={() => verifyCode()} disabled={phoneBusy || code.length !== 6}>{verifying ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{otpPurpose === 'SIGNUP' ? 'Verify and create account' : 'Verify and sign in'}</Text>}</TouchableOpacity>
              <TouchableOpacity disabled={countdown > 0 || requesting} onPress={() => void resendCode()}><Text style={[styles.link, (countdown > 0 || requesting) && styles.linkDisabled]}>{countdown > 0 ? `Resend in 00:${String(countdown).padStart(2, '0')}` : requesting ? 'Sending…' : 'Resend OTP'}</Text></TouchableOpacity>
              <TouchableOpacity disabled={phoneBusy} onPress={resetPhoneFlow}><Text style={styles.secondaryLink}>Change mobile number</Text></TouchableOpacity>
            </> : <>
              <Text style={styles.label}>Phone number or email</Text><View style={styles.inputWrapper}><Mail size={19} color="#64748B" /><TextInput style={styles.input} value={identifier} onChangeText={setIdentifier} placeholder="Phone number or email" autoCapitalize="none" placeholderTextColor="#94A3B8" /></View>
              <Text style={styles.label}>Password</Text><View style={styles.inputWrapper}><Lock size={19} color="#64748B" /><TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry={!showPassword} placeholderTextColor="#94A3B8" /><TouchableOpacity onPress={() => setShowPassword((value) => !value)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}><Eye size={21} color="#64748B" /></TouchableOpacity></View>
              <TouchableOpacity accessibilityLabel="Forgot password"><Text style={styles.forgot}>Forgot password?</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primary, passwordLoading && styles.buttonDisabled]} onPress={passwordLogin} disabled={passwordLoading}>{passwordLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Continue</Text>}</TouchableOpacity>
            </>}

            {!masked ? <><View style={styles.divider}><View style={styles.line} /><Text style={styles.dividerText}>or</Text><View style={styles.line} /></View><TouchableOpacity style={[styles.google, !googleClientConfigured && styles.buttonDisabled]} onPress={handleGoogleLogin} disabled={googleLoading || !googleClientConfigured}>{googleLoading ? <ActivityIndicator /> : <><Chrome size={21} color="#1E293B" /><Text style={styles.googleText}>Continue with Google</Text></>}</TouchableOpacity></> : null}
          </View>
          <View style={styles.secure}><ShieldCheck size={19} color="#0F766E" /><Text style={styles.secureText}>Your data is secure and protected with industry-standard encryption.</Text></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' },
  glowTeal: { position: 'absolute', width: 280, height: 280, borderRadius: 999, backgroundColor: '#CCFBF1', top: -120, right: -110, opacity: 0.7 },
  glowAmber: { position: 'absolute', width: 240, height: 240, borderRadius: 999, backgroundColor: '#FEF3C7', bottom: -130, left: -110, opacity: 0.65 },
  keyboardView: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 34, paddingBottom: 42, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 22 },
  brandName: { marginTop: 9, color: '#0F172A', fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  brandCaption: { marginTop: 1, color: '#0F766E', fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  subtitle: { marginTop: 18, color: '#64748B', fontWeight: '700', textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 30, padding: 22, gap: 13, borderWidth: 1, borderColor: '#E7EEF5', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.11, shadowRadius: 25, elevation: 7 },
  cardTitle: { fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: -0.7 },
  cardSubtitle: { color: '#64748B', lineHeight: 20, marginBottom: 2 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 15, backgroundColor: '#EEF2F7', marginTop: 3 },
  tab: { flex: 1, height: 44, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  tabActive: { backgroundColor: '#0F766E' },
  tabText: { color: '#64748B', fontWeight: '900' },
  tabTextActive: { color: '#FFFFFF' },
  infoPanel: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, padding: 12, backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#99F6E4' },
  infoText: { flex: 1, color: '#115E59', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  label: { color: '#334155', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 },
  inputWrapper: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 17, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', paddingHorizontal: 15 },
  countryCode: { borderRightWidth: 1, borderRightColor: '#CBD5E1', paddingRight: 11 },
  countryCodeText: { color: '#0F766E', fontWeight: '900' },
  input: { flex: 1, color: '#0F172A', fontSize: 15, fontWeight: '700' },
  forgot: { marginTop: -5, textAlign: 'right', color: '#0F766E', fontSize: 13, fontWeight: '900' },
  primary: { minHeight: 58, borderRadius: 17, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, shadowColor: '#0F766E', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 15, elevation: 4 },
  primaryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  buttonDisabled: { opacity: 0.5 },
  sent: { color: '#475569', fontWeight: '800', textAlign: 'center' },
  profilePanel: { backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#99F6E4', borderRadius: 19, padding: 14, gap: 11 },
  profileTitle: { color: '#134E4A', fontWeight: '900', fontSize: 15 },
  profileHelp: { color: '#0F766E', fontSize: 12, lineHeight: 17 },
  otpLabel: { color: '#334155', fontSize: 12, fontWeight: '900', textAlign: 'center', marginTop: 2 },
  otpRow: { flexDirection: 'row', gap: 6 },
  otpCell: { flex: 1, height: 54, borderRadius: 13, borderWidth: 1.5, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  otpActive: { borderColor: '#14B8A6', backgroundColor: '#F0FDFA' },
  otpDigit: { color: '#0F172A', fontSize: 22, fontWeight: '900' },
  hiddenOtpInput: { position: 'absolute', height: 1, width: 1, opacity: 0 },
  link: { color: '#0F766E', fontWeight: '900', textAlign: 'center' },
  linkDisabled: { color: '#94A3B8' },
  secondaryLink: { color: '#64748B', fontWeight: '800', textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { color: '#94A3B8', fontWeight: '800' },
  google: { minHeight: 55, borderRadius: 17, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  googleText: { color: '#1E293B', fontWeight: '900' },
  secure: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secureText: { color: '#64748B', fontSize: 11, fontWeight: '700' },
});
