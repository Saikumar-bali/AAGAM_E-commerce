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
import { ChevronLeft, KeyRound, Lock, Mail, ShieldCheck, User } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { createAsyncRequestLock } from '../auth/customerPhoneOtpFlow';
import { getUserSafeError, notify } from '../ui/notify';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const SignUpScreen = () => {
  const navigation = useNavigation<any>();
  const requestEmailSignup = useAuthStore((state) => state.requestEmailSignup);
  const verifyEmailSignup = useAuthStore((state) => state.verifyEmailSignup);
  const inputRef = useRef<TextInput>(null);
  const requestLock = useRef(createAsyncRequestLock()).current;
  const verificationLock = useRef(createAsyncRequestLock()).current;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [masked, setMasked] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const validateDetails = (showFeedback = true) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (name.trim().length < 2) {
      if (showFeedback) notify.warning('Full name required', 'Enter at least 2 characters.');
      return null;
    }
    if (!emailPattern.test(normalizedEmail)) {
      if (showFeedback) notify.warning('Valid email required', 'Enter a valid email address.');
      return null;
    }
    if (password.length < 8) {
      if (showFeedback) notify.warning('Password too short', 'Use at least 8 characters for your password.');
      return null;
    }
    if (password !== confirmPassword) {
      if (showFeedback) notify.warning('Passwords do not match', 'Enter the same password in both fields.');
      return null;
    }
    return normalizedEmail;
  };

  const requestCode = async (isResend = false) => {
    const normalizedEmail = validateDetails();
    if (!normalizedEmail || (isResend && countdown > 0)) return;

    await requestLock.run(async () => {
      setRequesting(true);
      try {
        const result = await requestEmailSignup(normalizedEmail);
        setEmail(normalizedEmail);
        setMasked(result.maskedDestination);
        setCode('');
        setCountdown(30);
        notify.success(isResend ? 'Email code resent' : 'Verification email sent', `Code sent to ${result.maskedDestination}.`);
        setTimeout(() => inputRef.current?.focus(), 180);
      } catch (error) {
        const status = (error as any)?.status ?? (error as any)?.response?.status;
        if (status === 409) {
          notify.info('Account already exists', 'Sign in with this email address instead.');
          navigation.goBack();
        } else {
          notify.error('Could not send email code', getUserSafeError(error, 'Please try again.'));
        }
      } finally {
        setRequesting(false);
      }
    });
  };

  const verifyCode = async (candidate = code) => {
    const normalizedEmail = validateDetails();
    if (!normalizedEmail || !/^\d{6}$/.test(candidate)) return;

    await verificationLock.run(async () => {
      setVerifying(true);
      try {
        await verifyEmailSignup({
          email: normalizedEmail,
          name: name.trim(),
          password,
          confirmPassword,
          code: candidate,
        });
        notify.success('Account created successfully', 'Your email is verified. Welcome to Aagaam.');
      } catch (error) {
        setCode('');
        notify.error('Code not verified', getUserSafeError(error, 'The code is wrong or expired. Request a new email code and try again.'));
        setTimeout(() => inputRef.current?.focus(), 100);
      } finally {
        setVerifying(false);
      }
    });
  };

  const updateCode = (value: string) => {
    const next = value.replace(/\D/g, '').slice(0, 6);
    setCode(next);
    if (next.length === 6 && validateDetails(false)) {
      setTimeout(() => void verifyCode(next), 100);
    }
  };

  const editDetails = () => {
    setMasked('');
    setCode('');
    setCountdown(0);
    setRequesting(false);
    setVerifying(false);
    requestLock.reset();
    verificationLock.reset();
  };

  const busy = requesting || verifying;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}><TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><ChevronLeft size={24} color="#1E293B" /></TouchableOpacity><Text style={styles.headerTitle}>Create account</Text></View>
        <View style={styles.content}>
          <View style={styles.hero}><View style={styles.icon}><Mail size={28} color="#0F766E" /></View><Text style={styles.title}>Create your account</Text><Text style={styles.subtitle}>We verify your email with a single-use code, just like Aagaam on the web.</Text></View>
          {!masked ? <View style={styles.card}>
            <Field icon={<User size={20} color="#64748B" />} value={name} onChangeText={setName} placeholder="Full name" autoCapitalize="words" autoComplete="name" />
            <Field icon={<Mail size={20} color="#0F766E" />} value={email} onChangeText={setEmail} placeholder="Email address" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Field icon={<Lock size={20} color="#64748B" />} value={password} onChangeText={setPassword} placeholder="Password (at least 8 characters)" secureTextEntry autoCapitalize="none" autoComplete="new-password" />
            <Field icon={<Lock size={20} color="#64748B" />} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm password" secureTextEntry autoCapitalize="none" autoComplete="new-password" />
            <TouchableOpacity style={styles.primary} onPress={() => void requestCode()} disabled={requesting}>{requesting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Email verification code</Text>}</TouchableOpacity>
          </View> : <View style={styles.card}>
            <View style={styles.verifyIcon}><KeyRound size={22} color="#0F766E" /></View>
            <Text style={styles.sent}>Enter the six-digit code sent to {masked}</Text>
            <TouchableOpacity style={styles.otpRow} onPress={() => inputRef.current?.focus()}>{Array.from({ length: 6 }).map((_, index) => <View key={index} style={[styles.otpCell, code.length === index && styles.otpActive]}><Text style={styles.otpDigit}>{code[index] || ''}</Text></View>)}</TouchableOpacity>
            <TextInput ref={inputRef} value={code} onChangeText={updateCode} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} autoFocus style={styles.hidden} accessibilityLabel="Six-digit email verification code" />
            <TouchableOpacity style={styles.primary} onPress={() => void verifyCode()} disabled={busy || code.length !== 6}>{verifying ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Verify and create account</Text>}</TouchableOpacity>
            <TouchableOpacity disabled={countdown > 0 || requesting} onPress={() => void requestCode(true)}><Text style={[styles.link, (countdown > 0 || requesting) && styles.linkDisabled]}>{countdown > 0 ? `Resend in 00:${String(countdown).padStart(2, '0')}` : requesting ? 'Sending…' : 'Resend email code'}</Text></TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={editDetails}><Text style={styles.secondaryLink}>Edit account details</Text></TouchableOpacity>
          </View>}
          <View style={styles.security}><ShieldCheck size={17} color="#15803D" /><Text style={styles.securityText}>Your account is created only after the email code is verified. The code is single-use and expires automatically.</Text></View>
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
  verifyIcon: { alignSelf: 'center', width: 48, height: 48, borderRadius: 16, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center' }, sent: { textAlign: 'center', color: '#475569', fontWeight: '800' }, otpRow: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' }, otpCell: { flex: 1, height: 54, borderRadius: 13, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' }, otpActive: { borderColor: '#14B8A6', backgroundColor: '#F0FDFA' }, otpDigit: { fontSize: 22, fontWeight: '900', color: '#0F172A' }, hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 }, link: { textAlign: 'center', color: '#0F766E', fontWeight: '900' }, linkDisabled: { color: '#94A3B8' }, secondaryLink: { textAlign: 'center', color: '#64748B', fontWeight: '800' },
  security: { marginTop: 18, borderRadius: 15, backgroundColor: '#F0FDF4', padding: 13, flexDirection: 'row', gap: 9 }, securityText: { flex: 1, color: '#166534', fontSize: 11, lineHeight: 17, fontWeight: '700' }, footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 22, marginBottom: 36 }, footerText: { color: '#64748B' }, loginText: { color: '#0F766E', fontWeight: '900' },
});
