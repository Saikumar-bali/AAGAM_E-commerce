import React, { useState } from 'react';
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
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react-native';
import { useAuthStore } from '@aagam/mobile-shared';
import Toast from 'react-native-toast-message';

const LoginScreen = ({ navigation }: any) => {
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Toast.show({ type: 'error', text1: 'Missing credentials', text2: 'Enter email and password.' });
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      Toast.show({ type: 'success', text1: 'Partner workspace ready', text2: 'Signed in successfully.' });
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Sign in failed',
        text2: error?.response?.data?.message || error?.message || 'Check your credentials.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => navigation.navigate('PartnerWelcome')}>
          <ArrowLeft size={18} color="#0F172A" />
          <Text style={styles.backText}>Partner applications</Text>
        </TouchableOpacity>

        <View style={styles.brandMark}><Text style={styles.brandLetter}>A</Text></View>
        <Text style={styles.kicker}>APPROVED PARTNER ACCESS</Text>
        <Text style={styles.title}>Sign in to operations</Text>
        <Text style={styles.subtitle}>
          Use the account activated after Admin approval. Application access tokens do not work as operational passwords.
        </Text>

        <View style={styles.securityCard}>
          <ShieldCheck size={21} color="#0F766E" />
          <Text style={styles.securityText}>Rider and Store accounts are role-routed and stored in device Keychain.</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputRow}>
            <Mail size={18} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="Operational email"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.inputRow}>
            <Lock size={18} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPassword((value) => !value)} style={styles.eye}>
              {showPassword ? <EyeOff size={18} color="#64748B" /> : <Eye size={18} color="#64748B" />}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.button, loading && styles.disabled]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <>
              <Text style={styles.buttonText}>Sign in</Text>
              <ArrowRight size={18} color="#FFFFFF" />
            </>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('PartnerWelcome')} style={styles.applyLink}>
          <Text style={styles.applyText}>Not approved yet? <Text style={styles.applyStrong}>Apply or track application</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 44 },
  back: { position: 'absolute', top: 44, left: 24, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { color: '#0F172A', fontSize: 13, fontWeight: '800' },
  brandMark: { width: 66, height: 66, borderRadius: 22, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  brandLetter: { color: '#FFFFFF', fontSize: 30, fontWeight: '900' },
  kicker: { color: '#0F766E', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#0F172A', fontSize: 32, fontWeight: '900', letterSpacing: -1.1, marginTop: 10 },
  subtitle: { color: '#64748B', fontSize: 14, lineHeight: 22, marginTop: 9 },
  securityCard: { flexDirection: 'row', gap: 11, alignItems: 'center', backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#99F6E4', borderRadius: 17, padding: 14, marginTop: 24 },
  securityText: { flex: 1, color: '#115E59', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  form: { gap: 14, marginTop: 24 },
  inputRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 17, paddingHorizontal: 16 },
  input: { flex: 1, color: '#0F172A', fontSize: 15, fontWeight: '600' },
  eye: { padding: 5 },
  button: { minHeight: 57, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 17, backgroundColor: '#0F766E', marginTop: 4 },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  applyLink: { alignItems: 'center', marginTop: 26 },
  applyText: { color: '#64748B', fontSize: 13 },
  applyStrong: { color: '#0F766E', fontWeight: '900' },
});

export { LoginScreen };
