import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, ArrowRight, Lock, Mail, Phone, ShieldCheck } from 'lucide-react-native';
import { apiClient, useAuthStore } from '@aagam/mobile-shared';
import Toast from 'react-native-toast-message';
import { AagamBrand } from '../components/AagamBrand';

const phoneForApi = (value: string) => {
  const compact = value.replace(/[\s().-]/g, '');
  if (/^\d{10}$/.test(compact)) return `+91${compact}`;
  if (/^91\d{10}$/.test(compact)) return `+${compact}`;
  return compact;
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
    const normalized = phoneForApi(phone);
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      Toast.show({ type: 'error', text1: 'Valid mobile required', text2: 'Enter your approved mobile number.' });
      return;
    }
    setLoading(true);
    try {
      const result = (await apiClient.post('/auth/partner/phone/request', { phoneE164: normalized, purpose: 'LOGIN' })).data;
      setPhone(normalized); setMasked(result.maskedDestination); setCode(''); setCountdown(30);
      setTimeout(() => inputRef.current?.focus(), 180);
    } catch (error: any) {
      const message = error?.response?.data?.message || error.message;
      Toast.show({ type: 'error', text1: 'Partner number not registered', text2: Array.isArray(message) ? message.join(', ') : message });
    } finally { setLoading(false); }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) return;
    setLoading(true);
    try {
      const response = await apiClient.post('/auth/mobile/partner/phone/verify', { phoneE164: phone, purpose: 'LOGIN', code });
      await setAuth(response.data.user, response.data.access_token);
      Toast.show({ type: 'success', text1: 'Partner workspace ready', text2: 'Signed in securely.' });
    } catch (error: any) {
      setCode('');
      Toast.show({ type: 'error', text1: 'Code not verified', text2: error.message });
    } finally { setLoading(false); }
  };

  const passwordLogin = async () => {
    if (!identifier.trim() || !password) {
      Toast.show({ type: 'error', text1: 'Missing credentials', text2: 'Enter phone/email and password.' });
      return;
    }
    setLoading(true);
    try {
      await login(identifier.trim(), password);
      Toast.show({ type: 'success', text1: 'Partner workspace ready', text2: 'Signed in successfully.' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Sign in failed', text2: error.message || 'Check your credentials.' });
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => navigation.navigate('PartnerWelcome')}><ArrowLeft size={18} color="#0F172A" /><Text style={styles.backText}>Partner applications</Text></TouchableOpacity>
        <View style={styles.brand}><AagamBrand caption="Verified partner network" /></View>
        <Text style={styles.kicker}>APPROVED PARTNER ACCESS</Text>
        <Text style={styles.title}>Sign in to operations</Text>
        <Text style={styles.subtitle}>Use the verified phone number from your approved Rider or Store application.</Text>
        <View style={styles.securityCard}><ShieldCheck size={21} color="#0F766E" /><Text style={styles.securityText}>Rider and Store roles are loaded from the same secure Aagam account and stored in Android Keychain.</Text></View>
        <View style={styles.tabs}><TouchableOpacity onPress={() => setMode('PHONE')} style={[styles.tab, mode === 'PHONE' && styles.tabActive]}><Phone size={17} color={mode === 'PHONE' ? '#fff' : '#64748B'} /><Text style={[styles.tabText, mode === 'PHONE' && styles.tabTextActive]}>Phone OTP</Text></TouchableOpacity><TouchableOpacity onPress={() => setMode('PASSWORD')} style={[styles.tab, mode === 'PASSWORD' && styles.tabActive]}><Lock size={17} color={mode === 'PASSWORD' ? '#fff' : '#64748B'} /><Text style={[styles.tabText, mode === 'PASSWORD' && styles.tabTextActive]}>Password</Text></TouchableOpacity></View>
        <View style={styles.form}>
          {mode === 'PHONE' ? !masked ? <><View style={styles.inputRow}><Phone size={18} color="#0F766E" /><TextInput style={styles.input} placeholder="Approved mobile number" placeholderTextColor="#94A3B8" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /></View><TouchableOpacity style={[styles.button, loading && styles.disabled]} onPress={requestCode} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.buttonText}>Send OTP</Text><ArrowRight size={18} color="#fff" /></>}</TouchableOpacity></> : <><Text style={styles.sent}>Code sent to {masked}</Text><TouchableOpacity style={styles.otpRow} onPress={() => inputRef.current?.focus()}>{Array.from({ length: 6 }).map((_, index) => <View key={index} style={[styles.otpCell, code.length === index && styles.otpActive]}><Text style={styles.otpDigit}>{code[index] || ''}</Text></View>)}</TouchableOpacity><TextInput ref={inputRef} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} autoFocus style={styles.hidden} /><TouchableOpacity style={[styles.button, (loading || code.length !== 6) && styles.disabled]} onPress={verifyCode} disabled={loading || code.length !== 6}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify and sign in</Text>}</TouchableOpacity><TouchableOpacity onPress={() => countdown === 0 ? requestCode() : undefined}><Text style={styles.link}>{countdown > 0 ? `Resend in 00:${String(countdown).padStart(2, '0')}` : 'Resend OTP'}</Text></TouchableOpacity><TouchableOpacity onPress={() => { setMasked(''); setCode(''); }}><Text style={styles.secondaryLink}>Change mobile number</Text></TouchableOpacity></> : <><View style={styles.inputRow}><Mail size={18} color="#64748B" /><TextInput style={styles.input} placeholder="Phone number or email" placeholderTextColor="#94A3B8" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" /></View><View style={styles.inputRow}><Lock size={18} color="#64748B" /><TextInput style={styles.input} placeholder="Password" placeholderTextColor="#94A3B8" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" /></View><TouchableOpacity style={[styles.button, loading && styles.disabled]} onPress={passwordLogin} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.buttonText}>Sign in</Text><ArrowRight size={18} color="#fff" /></>}</TouchableOpacity></>}
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('ResumeApplication')} style={styles.applyLink}><Text style={styles.applyText}>Not approved yet? <Text style={styles.applyStrong}>Resume or track application</Text></Text></TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' }, content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 54 }, back: { position: 'absolute', top: 44, left: 24, flexDirection: 'row', alignItems: 'center', gap: 7 }, backText: { color: '#0F172A', fontSize: 13, fontWeight: '800' }, brand: { marginBottom: 25 }, kicker: { color: '#0F766E', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, title: { color: '#0F172A', fontSize: 32, fontWeight: '900', letterSpacing: -1.1, marginTop: 10 }, subtitle: { color: '#64748B', fontSize: 14, lineHeight: 22, marginTop: 9 },
  securityCard: { flexDirection: 'row', gap: 11, alignItems: 'center', backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#99F6E4', borderRadius: 17, padding: 14, marginTop: 24 }, securityText: { flex: 1, color: '#115E59', fontSize: 12, lineHeight: 18, fontWeight: '700' }, tabs: { flexDirection: 'row', borderRadius: 14, backgroundColor: '#E2E8F0', padding: 4, marginTop: 20 }, tab: { flex: 1, height: 44, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, tabActive: { backgroundColor: '#0F766E' }, tabText: { color: '#64748B', fontWeight: '900' }, tabTextActive: { color: '#fff' },
  form: { gap: 14, marginTop: 16 }, inputRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 17, paddingHorizontal: 16 }, input: { flex: 1, color: '#0F172A', fontSize: 15, fontWeight: '600' }, button: { minHeight: 57, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 17, backgroundColor: '#0F766E', marginTop: 4 }, disabled: { opacity: 0.6 }, buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }, sent: { textAlign: 'center', color: '#475569', fontWeight: '800' }, otpRow: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' }, otpCell: { flex: 1, height: 54, borderRadius: 13, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' }, otpActive: { borderColor: '#14B8A6', backgroundColor: '#F0FDFA' }, otpDigit: { fontSize: 22, fontWeight: '900', color: '#0F172A' }, hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 }, link: { color: '#0F766E', textAlign: 'center', fontWeight: '900' }, secondaryLink: { color: '#64748B', textAlign: 'center', fontWeight: '800' }, applyLink: { alignItems: 'center', marginTop: 26 }, applyText: { color: '#64748B', fontSize: 13 }, applyStrong: { color: '#0F766E', fontWeight: '900' },
});

export { LoginScreen };
