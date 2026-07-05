import React, { useState } from 'react';
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
import { useAuthStore } from '../store/authStore';
import { Mail, Lock, User, Phone, ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

export const SignUpScreen = () => {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const signUp = useAuthStore((state) => state.signUp);

  const handleSignUp = async () => {
    if (!email || !password || !name) {
      Alert.alert('Missing details', 'Please enter your name, email, and password.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Use at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUp(name, email, password);
    } catch (error: any) {
      Alert.alert('Sign Up Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ChevronLeft size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Customer Account</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.heroTitle}>Start shopping with Aagam</Text>
          <Text style={styles.heroText}>Public signup creates customer accounts only. Store and rider access belongs in the dedicated partner apps after admin approval.</Text>

          <View style={styles.inputSection}>
            <View style={styles.inputWrapper}>
              <User size={20} color="#94A3B8" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Full Name" value={name} onChangeText={setName} placeholderTextColor="#94A3B8" />
            </View>
            <View style={styles.inputWrapper}>
              <Mail size={20} color="#94A3B8" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Email Address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholderTextColor="#94A3B8" />
            </View>
            <View style={styles.inputWrapper}>
              <Phone size={20} color="#94A3B8" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Phone Number optional" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor="#94A3B8" />
            </View>
            <View style={styles.inputWrapper}>
              <Lock size={20} color="#94A3B8" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#94A3B8" />
            </View>
          </View>

          <View style={styles.phoneNotice}>
            <Text style={styles.phoneNoticeTitle}>Phone login ready path</Text>
            <Text style={styles.phoneNoticeText}>OTP-less phone login needs Firebase Phone Number Verification token verification on the backend. Until that is configured, use email, Google, or normal backend auth.</Text>
          </View>

          <TouchableOpacity style={[styles.signUpButton, loading && styles.buttonDisabled]} onPress={handleSignUp} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.signUpButtonText}>Create Customer Account</Text>}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.loginText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20 },
  backButton: { padding: 8, borderRadius: 12, backgroundColor: '#FFFFFF', marginRight: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#1E293B' },
  content: { paddingHorizontal: 24 },
  heroTitle: { fontSize: 34, fontWeight: '900', color: '#0F172A', letterSpacing: -1.2 },
  heroText: { marginTop: 10, fontSize: 14, fontWeight: '700', lineHeight: 22, color: '#64748B' },
  inputSection: { marginTop: 28, marginBottom: 18 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, marginBottom: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, height: 58, fontSize: 16, color: '#1E293B' },
  phoneNotice: { borderRadius: 20, borderWidth: 1, borderColor: '#CCFBF1', backgroundColor: '#F0FDFA', padding: 16, marginBottom: 22 },
  phoneNoticeTitle: { fontSize: 14, fontWeight: '900', color: '#115E59' },
  phoneNoticeText: { marginTop: 6, fontSize: 12, fontWeight: '700', lineHeight: 18, color: '#0F766E' },
  signUpButton: { backgroundColor: '#0F172A', height: 58, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  buttonDisabled: { opacity: 0.7 },
  signUpButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: '#64748B', fontSize: 14 },
  loginText: { color: '#0F766E', fontSize: 14, fontWeight: '900' },
});
