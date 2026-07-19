import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthStore } from '@aagam/mobile-shared';
import { ArrowRight, Chrome, Lock, Mail, Phone, ShieldCheck } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '@env';

const googleClientConfigured = typeof GOOGLE_WEB_CLIENT_ID === 'string' && GOOGLE_WEB_CLIENT_ID.endsWith('.apps.googleusercontent.com');
const phoneForApi = (value: string) => {
  const compact = value.replace(/[\s().-]/g, '');
  if (/^\d{10}$/.test(compact)) return `+91${compact}`;
  if (/^91\d{10}$/.test(compact)) return `+${compact}`;
  return compact;
};

export const LoginScreen = () => {
  const navigation = useNavigation<any>();
  const login = useAuthStore((state) => state.login);
  const requestPhoneOtp = useAuthStore((state) => state.requestPhoneOtp);
  const verifyPhoneOtp = useAuthStore((state) => state.verifyPhoneOtp);
  const googleLogin = useAuthStore((state) => state.googleLogin);
  const inputRef = useRef<TextInput>(null);
  const [mode, setMode] = useState<'PHONE' | 'PASSWORD'>('PHONE');
  const [phone, setPhone] = useState('');
  const [masked, setMasked] = useState('');
  const [code, setCode] = useState('');
  const [newCustomer, setNewCustomer] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (googleClientConfigured) GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, offlineAccess: false });
  }, []);
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const requestCode = async () => {
    const normalized = phoneForApi(phone);
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) return Alert.alert('Valid mobile required', 'Enter a 10-digit Indian mobile number or an E.164 number.');
    setLoading(true);
    try {
      let result: any;
      try {
        result = await requestPhoneOtp(normalized, 'LOGIN');
        setNewCustomer(false);
      } catch (lookupError: any) {
        if (!String(lookupError?.message || '').toLowerCase().includes('not found')) throw lookupError;
        result = await requestPhoneOtp(normalized, 'SIGNUP');
        setNewCustomer(true);
      }
      setPhone(normalized); setMasked(result.maskedDestination); setCode(''); setCountdown(30);
      setTimeout(() => inputRef.current?.focus(), 180);
    } catch (error: any) {
      Alert.alert('Could not send OTP', error.message || 'Try again.');
    } finally { setLoading(false); }
  };

  const verifyCode = async (candidate = code) => {
    if (!/^\d{6}$/.test(candidate)) return;
    if (newCustomer && profileName.trim().length < 2) return Alert.alert('Full name required', 'Enter your name to finish creating the account.');
    setLoading(true);
    try { await verifyPhoneOtp({ phoneE164: phone, purpose: newCustomer ? 'SIGNUP' : 'LOGIN', code: candidate, ...(newCustomer ? { name: profileName.trim(), email: profileEmail.trim() || undefined } : {}) }); }
    catch (error: any) { setCode(''); Alert.alert('Code not verified', error.message); }
    finally { setLoading(false); }
  };

  const updateCode = (value: string) => {
    const next = value.replace(/\D/g, '').slice(0, 6);
    setCode(next);
    if (next.length === 6) setTimeout(() => void verifyCode(next), 100);
  };

  const passwordLogin = async () => {
    if (!identifier.trim() || !password) return Alert.alert('Missing details', 'Enter phone/email and password.');
    setLoading(true);
    try { await login(identifier.trim(), password); }
    catch (error: any) { Alert.alert('Login failed', error.message); }
    finally { setLoading(false); }
  };

  const handleGoogleLogin = async () => {
    if (!googleClientConfigured) return Alert.alert('Google Sign-In unavailable', 'Install a verified Customer APK.');
    try {
      setGoogleLoading(true);
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken || (response as any)?.idToken;
      if (!idToken) throw new Error('Google token missing');
      await googleLogin(idToken);
    } catch (error: any) {
      if (error?.code !== statusCodes.SIGN_IN_CANCELLED) Alert.alert('Google Sign-In failed', error.message || 'Try again.');
    } finally { setGoogleLoading(false); }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.content}>
        <View style={styles.header}><View style={styles.logo}><Text style={styles.logoText}>A</Text></View><Text style={styles.title}>AAGAM</Text><Text style={styles.subtitle}>Fast, secure Customer access</Text></View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in</Text>
          <View style={styles.tabs}><TouchableOpacity onPress={() => setMode('PHONE')} style={[styles.tab, mode === 'PHONE' && styles.tabActive]}><Phone size={17} color={mode === 'PHONE' ? '#fff' : '#64748B'} /><Text style={[styles.tabText, mode === 'PHONE' && styles.tabTextActive]}>Phone OTP</Text></TouchableOpacity><TouchableOpacity onPress={() => setMode('PASSWORD')} style={[styles.tab, mode === 'PASSWORD' && styles.tabActive]}><Lock size={17} color={mode === 'PASSWORD' ? '#fff' : '#64748B'} /><Text style={[styles.tabText, mode === 'PASSWORD' && styles.tabTextActive]}>Password</Text></TouchableOpacity></View>
          {mode === 'PHONE' && masked && newCustomer ? <View style={{ gap: 10, padding: 12, borderRadius: 14, backgroundColor: '#F0FDFA' }}><Text style={{ fontWeight: '900', color: '#134E4A' }}>Complete your profile</Text><TextInput style={styles.inputWrapper} value={profileName} onChangeText={setProfileName} placeholder="Full name" placeholderTextColor="#94A3B8" /><TextInput style={styles.inputWrapper} value={profileEmail} onChangeText={setProfileEmail} placeholder="Email (optional)" keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#94A3B8" /></View> : null}
          {mode === 'PHONE' ? !masked ? <><View style={styles.inputWrapper}><Phone size={19} color="#0F766E" /><TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="10-digit mobile number" keyboardType="phone-pad" placeholderTextColor="#94A3B8" /></View><TouchableOpacity style={styles.primary} onPress={requestCode} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.primaryText}>Send OTP</Text><ArrowRight size={19} color="#fff" /></>}</TouchableOpacity></> : <><Text style={styles.sent}>Code sent to {masked}</Text><TouchableOpacity style={styles.otpRow} onPress={() => inputRef.current?.focus()}>{Array.from({ length: 6 }).map((_, index) => <View key={index} style={[styles.otpCell, code.length === index && styles.otpActive]}><Text style={styles.otpDigit}>{code[index] || ''}</Text></View>)}</TouchableOpacity><TextInput ref={inputRef} value={code} onChangeText={updateCode} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} autoFocus style={styles.hidden} /><TouchableOpacity style={styles.primary} onPress={() => verifyCode()} disabled={loading || code.length !== 6}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Verify and sign in</Text>}</TouchableOpacity><TouchableOpacity onPress={() => countdown === 0 ? requestCode() : undefined}><Text style={styles.link}>{countdown > 0 ? `Resend in 00:${String(countdown).padStart(2, '0')}` : 'Resend OTP'}</Text></TouchableOpacity><TouchableOpacity onPress={() => { setMasked(''); setCode(''); }}><Text style={styles.secondaryLink}>Change mobile number</Text></TouchableOpacity></> : <><View style={styles.inputWrapper}><Mail size={19} color="#64748B" /><TextInput style={styles.input} value={identifier} onChangeText={setIdentifier} placeholder="Phone number or email" autoCapitalize="none" placeholderTextColor="#94A3B8" /></View><View style={styles.inputWrapper}><Lock size={19} color="#64748B" /><TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry placeholderTextColor="#94A3B8" /></View><TouchableOpacity style={styles.primary} onPress={passwordLogin} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Continue</Text>}</TouchableOpacity></>}
          <View style={styles.divider}><View style={styles.line} /><Text style={styles.dividerText}>or</Text><View style={styles.line} /></View>
          <TouchableOpacity style={styles.google} onPress={handleGoogleLogin} disabled={googleLoading || !googleClientConfigured}>{googleLoading ? <ActivityIndicator /> : <><Chrome size={21} color="#1E293B" /><Text style={styles.googleText}>Continue with Google</Text></>}</TouchableOpacity>
        </View>
        <View style={styles.footer}><Text style={styles.footerText}>New customer? </Text><TouchableOpacity onPress={() => navigation.navigate('SignUp')}><Text style={styles.registerText}>Create account</Text></TouchableOpacity></View>
        <View style={styles.secure}><ShieldCheck size={16} color="#15803D" /><Text style={styles.secureText}>OTP codes are single-use and expire after 10 minutes.</Text></View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' }, content: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 24 }, logo: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' }, logoText: { color: '#fff', fontSize: 34, fontWeight: '900' }, title: { marginTop: 12, fontSize: 30, fontWeight: '900', color: '#0F172A' }, subtitle: { color: '#64748B', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 28, padding: 22, gap: 14, elevation: 4 }, cardTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', textAlign: 'center' }, tabs: { flexDirection: 'row', borderRadius: 14, backgroundColor: '#F1F5F9', padding: 4 }, tab: { flex: 1, height: 44, borderRadius: 11, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }, tabActive: { backgroundColor: '#0F766E' }, tabText: { color: '#64748B', fontWeight: '900' }, tabTextActive: { color: '#fff' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', minHeight: 55, borderRadius: 15, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 14 }, input: { flex: 1, marginLeft: 9, color: '#0F172A', fontSize: 15 }, primary: { minHeight: 56, borderRadius: 16, backgroundColor: '#0F766E', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  sent: { textAlign: 'center', color: '#475569', fontWeight: '800' }, otpRow: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' }, otpCell: { flex: 1, height: 54, borderRadius: 13, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' }, otpActive: { borderColor: '#14B8A6', backgroundColor: '#F0FDFA' }, otpDigit: { fontSize: 22, fontWeight: '900', color: '#0F172A' }, hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 }, link: { color: '#0F766E', textAlign: 'center', fontWeight: '900' }, secondaryLink: { color: '#64748B', textAlign: 'center', fontWeight: '800' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 2 }, line: { flex: 1, height: 1, backgroundColor: '#E2E8F0' }, dividerText: { marginHorizontal: 12, color: '#94A3B8', fontWeight: '700' }, google: { height: 54, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' }, googleText: { fontWeight: '900', color: '#1E293B' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 }, footerText: { color: '#64748B' }, registerText: { color: '#0F766E', fontWeight: '900' }, secure: { marginTop: 16, flexDirection: 'row', gap: 7, justifyContent: 'center' }, secureText: { color: '#15803D', fontSize: 11, fontWeight: '700' },
});
