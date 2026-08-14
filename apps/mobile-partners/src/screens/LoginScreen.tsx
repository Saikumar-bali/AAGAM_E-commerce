import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient, useAuthStore } from '@aagam/mobile-shared';
import Toast from 'react-native-toast-message';
import { AagamMark } from '../components/AagamMark';

const BRAND_GREEN = '#057A55';
const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 10);
const phoneForApi = (value: string) => `+91${digitsOnly(value)}`;
// Keep phone OTP implementation intact for reuse when SMS/WhatsApp returns.
const PHONE_AUTH_ENABLED = false;
const errorMessage = (error: any, fallback: string) => {
  const raw = error?.response?.data?.message ?? error?.message;
  return Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' && raw.trim() ? raw : fallback;
};

const LoginScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const login = useAuthStore((state) => state.login);
  const setAuth = useAuthStore((state) => state.setAuth);
  const inputRef = useRef<TextInput>(null);
  const [mode, setMode] = useState<'PHONE' | 'PASSWORD'>('PASSWORD');
  const [phone, setPhone] = useState('');
  const [masked, setMasked] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const requestCode = async () => {
    const nationalNumber = digitsOnly(phone);
    if (nationalNumber.length !== 10) {
      Toast.show({ type: 'error', text1: 'Enter a valid mobile number', text2: 'Use exactly 10 digits.' });
      return;
    }
    const normalized = phoneForApi(nationalNumber);
    setLoading(true);
    try {
      const result = (await apiClient.post('/auth/partner/phone/request', { phoneE164: normalized, purpose: 'LOGIN' })).data;
      setPhone(nationalNumber);
      setMasked(result.maskedDestination);
      setCode('');
      setCountdown(30);
      Toast.show({ type: 'success', text1: 'OTP sent', text2: `Code sent to ${result.maskedDestination}.` });
      setTimeout(() => inputRef.current?.focus(), 180);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Partner number not registered', text2: errorMessage(error, 'Use the mobile number from your approved application.') });
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) return;
    setLoading(true);
    try {
      const response = await apiClient.post('/auth/mobile/partner/phone/verify', { phoneE164: phoneForApi(phone), purpose: 'LOGIN', code });
      await setAuth(response.data.user, response.data.access_token);
      Toast.show({ type: 'success', text1: 'Workspace ready', text2: 'Signed in securely to Aagaam Partners.' });
    } catch (error: any) {
      setCode('');
      Toast.show({ type: 'error', text1: 'Code not verified', text2: errorMessage(error, 'The OTP is wrong or expired.') });
    } finally {
      setLoading(false);
    }
  };

  const passwordLogin = async () => {
    if (!identifier.trim() || !password) {
      Toast.show({ type: 'error', text1: 'Missing credentials', text2: 'Enter your email or phone number and password.' });
      return;
    }
    setLoading(true);
    try {
      await login(identifier.trim(), password);
      Toast.show({ type: 'success', text1: 'Workspace ready', text2: 'Signed in successfully.' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Sign in failed', text2: errorMessage(error, 'Check your credentials and try again.') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FC" />
      <View style={styles.glowTeal} />
      <View style={styles.glowAmber} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 18) + 12,
            paddingBottom: Math.max(insets.bottom, 12) + 26,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          testID="partner_login_back"
          accessibilityRole="button"
          accessibilityLabel="Back to partner applications"
          style={styles.back}
          onPress={() => navigation.navigate('PartnerWelcome')}
        >
          <ArrowLeft size={24} color="#0F172A" strokeWidth={2.3} />
        </TouchableOpacity>

        <View style={styles.brandBlock}>
          <AagamMark size={82} radius={24} style={styles.logoCard} />
          <Text style={styles.brandName}>Aagaam</Text>
          <Text style={styles.brandCaption}>PARTNERS</Text>
        </View>

        <View style={styles.heroCopy}>
          <Text style={styles.title}>Welcome back!</Text>
          <Text style={styles.subtitle}>Sign in to access your partner account.</Text>
        </View>

        {PHONE_AUTH_ENABLED ? <View style={styles.tabs}>
          <TouchableOpacity
            testID="partner_login_phone_tab"
            accessibilityRole="button"
            onPress={() => setMode('PHONE')}
            style={[styles.tab, mode === 'PHONE' && styles.tabActive]}
          >
            <Phone size={18} color={mode === 'PHONE' ? '#FFFFFF' : '#6A7789'} />
            <Text style={[styles.tabText, mode === 'PHONE' && styles.tabTextActive]}>Phone OTP</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="partner_login_password_tab"
            accessibilityRole="button"
            onPress={() => setMode('PASSWORD')}
            style={[styles.tab, mode === 'PASSWORD' && styles.tabActive]}
          >
            <Lock size={18} color={mode === 'PASSWORD' ? '#FFFFFF' : '#6A7789'} />
            <Text style={[styles.tabText, mode === 'PASSWORD' && styles.tabTextActive]}>Email & Password</Text>
          </TouchableOpacity>
        </View> : null}

        <View style={styles.form}>
          {mode === 'PHONE' ? (
            !masked ? (
              <>
                <Text style={styles.label}>Mobile number</Text>
                <View style={styles.inputRow}>
                  <View style={styles.countryCode}>
                    <Text style={styles.countryCodeText}>+91</Text>
                  </View>
                  <TextInput
                    ref={inputRef}
                    testID="partner_phone_input"
                    style={styles.input}
                    placeholder="10-digit mobile number"
                    placeholderTextColor="#94A3B8"
                    value={phone}
                    onChangeText={(value) => setPhone(digitsOnly(value))}
                    keyboardType="number-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel-national"
                    maxLength={10}
                  />
                </View>
                <TouchableOpacity
                  testID="partner_phone_send_otp"
                  style={[styles.button, (loading || phone.length !== 10) && styles.disabled]}
                  onPress={requestCode}
                  disabled={loading || phone.length !== 10}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>Send OTP</Text>
                      <ArrowRight size={19} color="#FFFFFF" />
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.sent}>Code sent to {masked}</Text>
                <TouchableOpacity style={styles.otpRow} onPress={() => inputRef.current?.focus()}>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <View key={index} style={[styles.otpCell, code.length === index && styles.otpActive]}>
                      <Text style={styles.otpDigit}>{code[index] || ''}</Text>
                    </View>
                  ))}
                </TouchableOpacity>
                <TextInput
                  ref={inputRef}
                  value={code}
                  onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={6}
                  autoFocus
                  style={styles.hidden}
                />
                <TouchableOpacity
                  style={[styles.button, (loading || code.length !== 6) && styles.disabled]}
                  onPress={verifyCode}
                  disabled={loading || code.length !== 6}
                >
                  {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Verify and sign in</Text>}
                </TouchableOpacity>
                <TouchableOpacity disabled={countdown > 0 || loading} onPress={() => countdown === 0 ? requestCode() : undefined}>
                  <Text style={[styles.link, (countdown > 0 || loading) && styles.linkDisabled]}>
                    {countdown > 0 ? `Resend in 00:${String(countdown).padStart(2, '0')}` : 'Resend OTP'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={loading}
                  onPress={() => {
                    setMasked('');
                    setCode('');
                    setCountdown(0);
                  }}
                >
                  <Text style={styles.secondaryLink}>Change mobile number</Text>
                </TouchableOpacity>
              </>
            )
          ) : (
            <>
              <Text style={styles.label}>Email or phone number</Text>
              <View style={styles.inputRow}>
                <Mail size={19} color="#6A7789" />
                <TextInput
                  testID="partner_password_identifier"
                  style={styles.input}
                  placeholder="Enter email or phone number"
                  placeholderTextColor="#94A3B8"
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="username"
                  autoComplete="username"
                  returnKeyType="next"
                />
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={styles.inputRow}>
                <Lock size={19} color="#6A7789" />
                <TextInput
                  testID="partner_password_input"
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!passwordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  autoComplete="current-password"
                  returnKeyType="done"
                  onSubmitEditing={() => void passwordLogin()}
                />
                <TouchableOpacity
                  testID="partner_password_visibility"
                  accessibilityRole="button"
                  accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
                  style={styles.visibilityButton}
                  onPress={() => setPasswordVisible((visible) => !visible)}
                >
                  {passwordVisible ? <EyeOff size={21} color="#6A7789" /> : <Eye size={21} color="#6A7789" />}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                testID="partner_password_signin"
                style={[styles.button, loading && styles.disabled]}
                onPress={passwordLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.buttonText}>Sign in</Text>
                    <ArrowRight size={19} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate('ResumeApplication')}
          style={styles.applyLink}
        >
          <Text style={styles.applyText}>
            Application pending? <Text style={styles.applyStrong}>Resume or track it</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  glowTeal: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#D8FAF2',
    top: -130,
    right: -140,
    opacity: 0.92,
  },
  glowAmber: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#FFF1C9',
    bottom: -130,
    left: -105,
    opacity: 0.78,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  brandBlock: {
    alignItems: 'center',
    marginTop: 2,
  },
  logoCard: {
    backgroundColor: '#061B36',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 17,
    elevation: 6,
  },
  brandName: {
    color: '#0F172A',
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '900',
    letterSpacing: -1.4,
    marginTop: 13,
  },
  brandCaption: {
    color: BRAND_GREEN,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
    letterSpacing: 2,
  },
  heroCopy: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 21,
  },
  title: {
    color: '#0F172A',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  subtitle: {
    color: '#6A7789',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 7,
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: 19,
    backgroundColor: '#E9EEF4',
    padding: 5,
    minHeight: 58,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 6,
  },
  tabActive: {
    backgroundColor: BRAND_GREEN,
    shadowColor: BRAND_GREEN,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  tabText: {
    color: '#6A7789',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  form: {
    gap: 11,
    marginTop: 21,
  },
  label: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.65,
    marginTop: 1,
  },
  inputRow: {
    minHeight: 59,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D9E0E8',
    borderRadius: 18,
    paddingHorizontal: 15,
  },
  countryCode: {
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
    paddingRight: 12,
  },
  countryCodeText: {
    color: BRAND_GREEN,
    fontWeight: '900',
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 0,
  },
  visibilityButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    minHeight: 59,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 18,
    backgroundColor: BRAND_GREEN,
    marginTop: 5,
    shadowColor: BRAND_GREEN,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.23,
    shadowRadius: 15,
    elevation: 4,
  },
  disabled: {
    opacity: 0.52,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  sent: {
    textAlign: 'center',
    color: '#475569',
    fontWeight: '800',
    marginVertical: 3,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
  },
  otpCell: {
    flex: 1,
    height: 54,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpActive: {
    borderColor: '#14B8A6',
    backgroundColor: '#F0FDFA',
  },
  otpDigit: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  link: {
    color: BRAND_GREEN,
    textAlign: 'center',
    fontWeight: '900',
    paddingTop: 3,
  },
  linkDisabled: {
    color: '#94A3B8',
  },
  secondaryLink: {
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '800',
  },
  applyLink: {
    alignItems: 'center',
    marginTop: 22,
  },
  applyText: {
    color: '#64748B',
    fontSize: 13,
  },
  applyStrong: {
    color: BRAND_GREEN,
    fontWeight: '900',
  },
});

export { LoginScreen };
