import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { ChevronLeft, Mail, Phone, ShieldCheck, User } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

const phoneForApi = (value: string) => {
  const compact = value.replace(/[\s().-]/g, '');
  if (/^\d{10}$/.test(compact)) return `+91${compact}`;
  if (/^91\d{10}$/.test(compact)) return `+${compact}`;
  return compact;
};

export const SignUpScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const requestPhoneOtp = useAuthStore((state) => state.requestPhoneOtp);
  const verifyPhoneOtp = useAuthStore((state) => state.verifyPhoneOtp);
  const inputRef = useRef<TextInput>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(String(route.params?.phone || ''));
  const [email, setEmail] = useState('');
  const [masked, setMasked] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const requestCode = async () => {
    const normalized = phoneForApi(phone);
    if (name.trim().length < 2) return Alert.alert('Full name required', 'Enter your full name.');
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) return Alert.alert('Valid mobile required', 'Enter a 10-digit Indian mobile number or an E.164 number.');
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return Alert.alert('Invalid email', 'Enter a valid email address or leave it blank.');
    setLoading(true);
    try {
      const result = await requestPhoneOtp(normalized, 'SIGNUP');
      setPhone(normalized); setMasked(result.maskedDestination); setCode(''); setCountdown(30);
      setTimeout(() => inputRef.current?.focus(), 180);
    } catch (error: any) {
      Alert.alert('Could not create account', error.message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign in', onPress: () => navigation.goBack() },
      ]);
    } finally { setLoading(false); }
  };

  const verifyCode = async (candidate = code) => {
    if (!/^\d{6}$/.test(candidate)) return;
    setLoading(true);
    try {
      await verifyPhoneOtp({
        phoneE164: phone,
        purpose: 'SIGNUP',
        code: candidate,
        name: name.trim(),
        email: email.trim() || undefined,
      });
    } catch (error: any) {
      setCode('');
      Alert.alert('Code not verified', error.message);
    } finally { setLoading(false); }
  };

  const updateCode = (value: string) => {
    const next = value.replace(/\D/g, '').slice(0, 6);
    setCode(next);
    if (next.length === 6) setTimeout(() => void verifyCode(next), 100);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}><TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><ChevronLeft size={24} color="#1E293B" /></TouchableOpacity><Text style={styles.headerTitle}>Create account</Text></View>
        <View style={styles.content}>
          <View style={styles.hero}><View style={styles.icon}><Phone size={28} color="#0F766E" /></View><Text style={styles.title}>Simple phone signup</Text><Text style={styles.subtitle}>Your verified mobile number becomes your primary AAGAM login. Email is optional.</Text></View>
          {!masked ? <View style={styles.card}>
            <Field icon={<User size={20} color="#64748B" />} value={name} onChangeText={setName} placeholder="Full name" autoCapitalize="words" />
            <Field icon={<Phone size={20} color="#0F766E" />} value={phone} onChangeText={setPhone} placeholder="10-digit mobile number" keyboardType="phone-pad" />
            <Field icon={<Mail size={20} color="#64748B" />} value={email} onChangeText={setEmail} placeholder="Email (optional)" keyboardType="email-address" autoCapitalize="none" />
            <TouchableOpacity style={styles.primary} onPress={requestCode} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send OTP</Text>}</TouchableOpacity>
          </View> : <View style={styles.card}>
            <Text style={styles.sent}>Enter the code sent to {masked}</Text>
            <TouchableOpacity style={styles.otpRow} onPress={() => inputRef.current?.focus()}>{Array.from({ length: 6 }).map((_, index) => <View key={index} style={[styles.otpCell, code.length === index && styles.otpActive]}><Text style={styles.otpDigit}>{code[index] || ''}</Text></View>)}</TouchableOpacity>
            <TextInput ref={inputRef} value={code} onChangeText={updateCode} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} autoFocus style={styles.hidden} />
            <TouchableOpacity style={styles.primary} onPress={() => verifyCode()} disabled={loading || code.length !== 6}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Verify and create account</Text>}</TouchableOpacity>
            <TouchableOpacity onPress={() => countdown === 0 ? requestCode() : undefined}><Text style={styles.link}>{countdown > 0 ? `Resend in 00:${String(countdown).padStart(2, '0')}` : 'Resend OTP'}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { setMasked(''); setCode(''); }}><Text style={styles.secondaryLink}>Edit details</Text></TouchableOpacity>
          </View>}
          <View style={styles.security}><ShieldCheck size={17} color="#15803D" /><Text style={styles.securityText}>No password is required. The OTP is single-use and expires after 10 minutes.</Text></View>
          <View style={styles.footer}><Text style={styles.footerText}>Already have an account? </Text><TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.loginText}>Sign in</Text></TouchableOpacity></View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

function Field({ icon, ...props }: any) { return <View style={styles.field}>{icon}<TextInput {...props} style={styles.input} placeholderTextColor="#94A3B8" /></View>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingTop: 54, paddingBottom: 14 }, back: { padding: 9, borderRadius: 12, backgroundColor: '#fff', marginRight: 14 }, headerTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' }, content: { padding: 22 },
  hero: { alignItems: 'center', marginBottom: 24 }, icon: { width: 66, height: 66, borderRadius: 22, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, title: { marginTop: 14, fontSize: 25, fontWeight: '900', color: '#0F172A' }, subtitle: { marginTop: 7, color: '#64748B', fontSize: 13, lineHeight: 19, textAlign: 'center', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 26, padding: 20, gap: 14, elevation: 3 }, field: { minHeight: 56, borderRadius: 15, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }, input: { flex: 1, marginLeft: 10, fontSize: 15, color: '#0F172A' }, primary: { minHeight: 56, borderRadius: 16, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  sent: { textAlign: 'center', color: '#475569', fontWeight: '800' }, otpRow: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' }, otpCell: { flex: 1, height: 54, borderRadius: 13, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' }, otpActive: { borderColor: '#14B8A6', backgroundColor: '#F0FDFA' }, otpDigit: { fontSize: 22, fontWeight: '900', color: '#0F172A' }, hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 }, link: { textAlign: 'center', color: '#0F766E', fontWeight: '900' }, secondaryLink: { textAlign: 'center', color: '#64748B', fontWeight: '800' },
  security: { marginTop: 18, borderRadius: 15, backgroundColor: '#F0FDF4', padding: 13, flexDirection: 'row', gap: 9 }, securityText: { flex: 1, color: '#166534', fontSize: 11, lineHeight: 17, fontWeight: '700' }, footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 22, marginBottom: 36 }, footerText: { color: '#64748B' }, loginText: { color: '#0F766E', fontWeight: '900' },
});
