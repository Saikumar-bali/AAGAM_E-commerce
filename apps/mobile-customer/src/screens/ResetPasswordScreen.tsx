import { apiClient } from '@aagam/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import { CheckCircle2, ChevronLeft, Eye, KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
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
import { getUserSafeError, notify } from '../ui/notify';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ResetPasswordScreen = () => {
  const navigation = useNavigation<any>();
  const [step, setStep] = useState<'REQUEST' | 'RESET' | 'DONE'>('REQUEST');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const requestCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailPattern.test(normalizedEmail)) {
      notify.warning('Valid email required', 'Enter the email address linked to your Aagaam account.');
      return;
    }
    setLoading(true);
    try {
      await apiClient.post('/auth/password/forgot', { email: normalizedEmail });
      setEmail(normalizedEmail);
      setStep('RESET');
      setCode('');
      setCountdown(30);
      notify.success('Reset code sent', 'Check your email for the six-digit verification code.');
    } catch (error) {
      notify.error('Could not send reset code', getUserSafeError(error, 'Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!/^\d{6}$/.test(code)) {
      notify.warning('Complete code required', 'Enter the six-digit code from your email.');
      return;
    }
    if (password.length < 8) {
      notify.warning('Stronger password required', 'Use at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      notify.warning('Passwords do not match', 'Enter the same password in both fields.');
      return;
    }
    setLoading(true);
    try {
      await apiClient.post('/auth/password/reset', { email, code, password, confirmPassword });
      setStep('DONE');
      setPassword('');
      setConfirmPassword('');
      notify.success('Password updated', 'You can now sign in with your new password.');
    } catch (error) {
      notify.error('Password reset failed', getUserSafeError(error, 'The code may be invalid or expired. Request a new one.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to sign in" style={styles.back} onPress={() => navigation.goBack()}><ChevronLeft size={23} color="#0F172A" /></TouchableOpacity>
          <Text style={styles.headerTitle}>Reset password</Text>
        </View>

        <View style={styles.heroIcon}>{step === 'DONE' ? <CheckCircle2 size={31} color="#15803D" /> : <ShieldCheck size={31} color="#0F766E" />}</View>
        <Text style={styles.title}>{step === 'DONE' ? 'Password updated' : 'Secure account recovery'}</Text>
        <Text style={styles.subtitle}>{step === 'REQUEST' ? 'Enter your account email and we’ll send a single-use verification code.' : step === 'RESET' ? `Enter the code sent to ${email}, then choose a new password.` : 'Your new password is ready. Return to sign in to continue.'}</Text>

        <View style={styles.card}>
          {step === 'REQUEST' ? <>
            <Text style={styles.label}>Email address</Text>
            <View style={styles.field}><Mail size={19} color="#64748B" /><TextInput accessibilityLabel="Account email address" style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor="#94A3B8" keyboardType="email-address" autoCapitalize="none" autoComplete="email" /></View>
            <TouchableOpacity accessibilityRole="button" style={[styles.primary, loading && styles.disabled]} disabled={loading} onPress={() => void requestCode()}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <><KeyRound size={19} color="#FFFFFF" /><Text style={styles.primaryText}>Send reset code</Text></>}</TouchableOpacity>
          </> : null}

          {step === 'RESET' ? <>
            <Text style={styles.label}>Verification code</Text>
            <TextInput accessibilityLabel="Six-digit password reset code" style={[styles.field, styles.codeInput]} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" placeholderTextColor="#94A3B8" keyboardType="number-pad" maxLength={6} autoComplete="sms-otp" />
            <Text style={styles.label}>New password</Text>
            <View style={styles.field}><Lock size={19} color="#64748B" /><TextInput accessibilityLabel="New password" style={styles.input} value={password} onChangeText={setPassword} placeholder="At least 8 characters" placeholderTextColor="#94A3B8" secureTextEntry={!showPassword} autoComplete="new-password" /><TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide passwords' : 'Show passwords'} onPress={() => setShowPassword((value) => !value)}><Eye size={20} color="#64748B" /></TouchableOpacity></View>
            <Text style={styles.label}>Confirm password</Text>
            <View style={styles.field}><Lock size={19} color="#64748B" /><TextInput accessibilityLabel="Confirm new password" style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat new password" placeholderTextColor="#94A3B8" secureTextEntry={!showPassword} autoComplete="new-password" /></View>
            <TouchableOpacity accessibilityRole="button" style={[styles.primary, (loading || code.length !== 6) && styles.disabled]} disabled={loading || code.length !== 6} onPress={() => void resetPassword()}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Set new password</Text>}</TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={loading || countdown > 0} onPress={() => void requestCode()}><Text style={[styles.link, (loading || countdown > 0) && styles.linkDisabled]}>{countdown > 0 ? `Resend in 00:${String(countdown).padStart(2, '0')}` : 'Resend code'}</Text></TouchableOpacity>
          </> : null}

          {step === 'DONE' ? <>
            <View style={styles.success}><CheckCircle2 size={22} color="#15803D" /><Text style={styles.successText}>Your password was reset successfully.</Text></View>
            <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => navigation.navigate('Login')}><Text style={styles.primaryText}>Back to sign in</Text></TouchableOpacity>
          </> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F7FB' },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 42, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#0F172A', fontSize: 19, fontWeight: '900' },
  heroIcon: { width: 66, height: 66, borderRadius: 22, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { color: '#0F172A', fontSize: 27, fontWeight: '900', textAlign: 'center', marginTop: 16 },
  subtitle: { color: '#64748B', fontSize: 13, lineHeight: 20, fontWeight: '700', textAlign: 'center', marginTop: 8, marginBottom: 22 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 25, borderWidth: 1, borderColor: '#E2E8F0', padding: 20, gap: 11, elevation: 4 },
  label: { color: '#334155', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 3 },
  field: { minHeight: 56, borderRadius: 16, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, color: '#0F172A' },
  input: { flex: 1, color: '#0F172A', fontSize: 15, fontWeight: '700' },
  codeInput: { textAlign: 'center', fontSize: 22, fontWeight: '900', letterSpacing: 8 },
  primary: { minHeight: 56, borderRadius: 16, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  link: { color: '#0F766E', fontWeight: '900', textAlign: 'center', paddingVertical: 5 },
  linkDisabled: { color: '#94A3B8' },
  success: { borderRadius: 15, backgroundColor: '#F0FDF4', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 9 },
  successText: { flex: 1, color: '#166534', fontWeight: '800' },
});
