import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, ArrowRight, Lock, Mail, Phone, ShieldCheck } from 'lucide-react-native';
import { apiClient, useAuthStore } from '@aagam/mobile-shared';
import Toast from 'react-native-toast-message';
import { AagamBrand } from '../components/AagamBrand';

const digitsOnly = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
};
const phoneForApi = (value: string) => `+91${digitsOnly(value)}`;
const errorMessage = (error: any, fallback: string) => {
  const raw = error?.response?.data?.message ?? error?.message;
  return Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' && raw.trim() ? raw : fallback;
};

const LoginScreen = ({ navigation }: any) => {
  const login = useAuthStore((state) => state.login);
  const setAuth = useAuthStore((state) => state.setAuth);
  const inputRef = useRef<TextInput>(null);
  const [mode, setMode] = useState<'PHONE' | 'PASSWORD'>('PHONE');
  const [phone, setPhone] = useState('');
  const [masked, setMasked] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
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
      Toast.show({ type: 'error', text1: 'Missing credentials', text2: 'Enter phone/email and password.' });
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.glowTeal} />
      <View style={styles.glowAmber} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.navigate('PartnerWelcome')}><ArrowLeft size={18} color="#0F172A" /><Text style={styles.backText}>Partner applications</Text></TouchableOpacity>
        <View style={styles.brand}><AagamBrand caption="Verified partner network" /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>APPROVED PARTNER ACCESS</Text>
          <Text style={styles.title}>Run deliveries and stores with confidence</Text>
          <Text style={styles.subtitle}>Sign in with the verified mobile number attached to your approved Rider or Store account.</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.securityCard}><View style={styles.securityIcon}><ShieldCheck size={20} color="#0F766E" /></View><View style={{ flex: 1 }}><Text style={styles.securityTitle}>Protected partner access</Text><Text style={styles.securityText}>Only approved partner accounts can enter operational workspaces.</Text></View></View>
          <View style={styles.tabs}><TouchableOpacity onPress={() => setMode('PHONE')} style={[styles.tab, mode === 'PHONE' && styles.tabActive]}><Phone size={17} color={mode === 'PHONE' ? '#fff' : '#64748B'} /><Text style={[styles.tabText, mode === 'PHONE' && styles.tabTextActive]}>Phone OTP</Text></TouchableOpacity><TouchableOpacity onPress={() => setMode('PASSWORD')} style={[styles.tab, mode === 'PASSWORD' && styles.tabActive]}><Lock size={17} color={mode === 'PASSWORD' ? '#fff' : '#64748B'} /><Text style={[styles.tabText, mode === 'PASSWORD' && styles.tabTextActive]}>Password</Text></TouchableOpacity></View>
          <View style={styles.form}>
            {mode === 'PHONE' ? !masked ? <><Text style={styles.label}>Mobile number</Text><View style={styles.inputRow}><View style={styles.countryCode}><Text style={styles.countryCodeText}>+91</Text></View><TextInput testID="partner_phone_input" style={styles.input} placeholder="10-digit mobile number" placeholderTextColor="#94A3B8" value={phone} onChangeText={(value) => setPhone(digitsOnly(value))} keyboardType="number-pad" textContentType="telephoneNumber" autoComplete="tel" maxLength={13} /></View><TouchableOpacity style={[styles.button, (loading || phone.length !== 10) && styles.disabled]} onPress={requestCode} disabled={loading || phone.length !== 10}>{loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.buttonText}>Send OTP</Text><ArrowRight size={18} color="#fff" /></>}</TouchableOpacity></> : <><Text style={styles.sent}>Code sent to {masked}</Text><TouchableOpacity style={styles.otpRow} onPress={() => inputRef.current?.focus()}>{Array.from({ length: 6 }).map((_, index) => <View key={index} style={[styles.otpCell, code.length === index && styles.otpActive]}><Text style={styles.otpDigit}>{code[index] || ''}</Text></View>)}</TouchableOpacity><TextInput ref={inputRef} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} autoFocus style={styles.hidden} /><TouchableOpacity style={[styles.button, (loading || code.length !== 6) && styles.disabled]} onPress={verifyCode} disabled={loading || code.length !== 6}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify and sign in</Text>}</TouchableOpacity><TouchableOpacity disabled={countdown > 0 || loading} onPress={() => countdown === 0 ? requestCode() : undefined}><Text style={[styles.link, (countdown > 0 || loading) && styles.linkDisabled]}>{countdown > 0 ? `Resend in 00:${String(countdown).padStart(2, '0')}` : 'Resend OTP'}</Text></TouchableOpacity><TouchableOpacity disabled={loading} onPress={() => { setMasked(''); setCode(''); setCountdown(0); }}><Text style={styles.secondaryLink}>Change mobile number</Text></TouchableOpacity></> : <><Text style={styles.label}>Phone number or email</Text><View style={styles.inputRow}><Mail size={18} color="#64748B" /><TextInput style={styles.input} placeholder="Phone number or email" placeholderTextColor="#94A3B8" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" /></View><Text style={styles.label}>Password</Text><View style={styles.inputRow}><Lock size={18} color="#64748B" /><TextInput style={styles.input} placeholder="Password" placeholderTextColor="#94A3B8" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" /></View><TouchableOpacity style={[styles.button, loading && styles.disabled]} onPress={passwordLogin} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.buttonText}>Sign in</Text><ArrowRight size={18} color="#fff" /></>}</TouchableOpacity></>}
          </View>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('ResumeApplication')} style={styles.applyLink}><Text style={styles.applyText}>Application pending? <Text style={styles.applyStrong}>Resume or track it</Text></Text></TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FB' }, glowTeal: { position: 'absolute', width: 270, height: 270, borderRadius: 999, backgroundColor: '#CCFBF1', top: -110, right: -100, opacity: 0.75 }, glowAmber: { position: 'absolute', width: 230, height: 230, borderRadius: 999, backgroundColor: '#FEF3C7', bottom: -120, left: -100, opacity: 0.65 }, content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 86, paddingBottom: 44 }, back: { position: 'absolute', top: 42, left: 24, flexDirection: 'row', alignItems: 'center', gap: 7, zIndex: 2 }, backText: { color: '#0F172A', fontSize: 13, fontWeight: '800' }, brand: { marginBottom: 25 }, heroCopy: { marginBottom: 22 }, kicker: { color: '#0F766E', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, title: { color: '#0F172A', fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -1.1, marginTop: 10 }, subtitle: { color: '#64748B', fontSize: 14, lineHeight: 22, marginTop: 9 }, card: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 18, borderWidth: 1, borderColor: '#E8EEF5', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.1, shadowRadius: 24, elevation: 6 }, securityCard: { flexDirection: 'row', gap: 11, alignItems: 'center', backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#99F6E4', borderRadius: 18, padding: 13 }, securityIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, securityTitle: { color: '#134E4A', fontSize: 13, fontWeight: '900' }, securityText: { color: '#0F766E', fontSize: 11, lineHeight: 16, marginTop: 2, fontWeight: '600' }, tabs: { flexDirection: 'row', borderRadius: 15, backgroundColor: '#EEF2F7', padding: 4, marginTop: 17 }, tab: { flex: 1, height: 44, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, tabActive: { backgroundColor: '#0F766E' }, tabText: { color: '#64748B', fontWeight: '900' }, tabTextActive: { color: '#fff' }, form: { gap: 11, marginTop: 16 }, label: { color: '#334155', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 }, inputRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 17, paddingHorizontal: 15 }, countryCode: { borderRightWidth: 1, borderRightColor: '#CBD5E1', paddingRight: 12 }, countryCodeText: { color: '#0F766E', fontWeight: '900' }, input: { flex: 1, color: '#0F172A', fontSize: 15, fontWeight: '700' }, button: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 17, backgroundColor: '#0F766E', marginTop: 5, shadowColor: '#0F766E', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 15, elevation: 4 }, disabled: { opacity: 0.52 }, buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }, sent: { textAlign: 'center', color: '#475569', fontWeight: '800', marginVertical: 2 }, otpRow: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' }, otpCell: { flex: 1, height: 54, borderRadius: 13, borderWidth: 1.5, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }, otpActive: { borderColor: '#14B8A6', backgroundColor: '#F0FDFA' }, otpDigit: { fontSize: 22, fontWeight: '900', color: '#0F172A' }, hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 }, link: { color: '#0F766E', textAlign: 'center', fontWeight: '900', paddingTop: 3 }, linkDisabled: { color: '#94A3B8' }, secondaryLink: { color: '#64748B', textAlign: 'center', fontWeight: '800' }, applyLink: { alignItems: 'center', marginTop: 24 }, applyText: { color: '#64748B', fontSize: 13 }, applyStrong: { color: '#0F766E', fontWeight: '900' },
});

export { LoginScreen };