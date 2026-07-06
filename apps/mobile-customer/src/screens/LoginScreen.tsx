import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useAuthStore } from '@aagam/mobile-shared';
import { Mail, Lock, ArrowRight, Chrome, Phone } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '@env';

export const LoginScreen = () => {
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [carrierLoading, setCarrierLoading] = useState(false);
  const login = useAuthStore((state) => state.login);
  const googleLogin = useAuthStore((state) => state.googleLogin);
  const carrierLogin = useAuthStore((state) => state.phonePnvLogin);

  React.useEffect(() => { GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, offlineAccess: false }); }, []);

  const handleLogin = async () => {
    if (!email || !password) { Alert.alert('Missing details', 'Please enter email and password.'); return; }
    setLoading(true);
    try { await login(email, password); } catch (error: any) { Alert.alert('Login Failed', error.message); } finally { setLoading(false); }
  };

  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true);
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;
      if (!idToken) throw new Error('Google token missing');
      await googleLogin(idToken);
    } catch (error: any) {
      if (error?.code === statusCodes.SIGN_IN_CANCELLED) return;
      Alert.alert('Google Sign-In Failed', error?.message || 'Unable to sign in with Google');
    } finally { setGoogleLoading(false); }
  };

  const handleCarrierLogin = async () => {
    setCarrierLoading(true);
    try { await carrierLogin(); } catch (error: any) { Alert.alert('Carrier sign-in failed', error.message); } finally { setCarrierLoading(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.bgCircle1} />
      <View style={styles.bgCircle2} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.content}>
        <View style={styles.header}>
          <View style={styles.logoRing}><View style={styles.logoCore}><Text style={styles.logoText}>A</Text></View></View>
          <Text style={styles.title}>AAGAM</Text>
          <Text style={styles.subtitle}>Customer shopping, live tracking, support, and alerts</Text>
        </View>
        <View style={styles.glassCard}>
          <Text style={styles.cardTitle}>Customer Sign In</Text>
          <View style={styles.inputGroup}>
            <View style={styles.inputWrapper}><Mail size={18} color="#94A3B8" /><TextInput style={styles.input} placeholder="Email" placeholderTextColor="#94A3B8" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /></View>
            <View style={styles.inputWrapper}><Lock size={18} color="#94A3B8" /><TextInput style={styles.input} placeholder="Password" placeholderTextColor="#94A3B8" value={password} onChangeText={setPassword} secureTextEntry /></View>
          </View>
          <TouchableOpacity style={[styles.loginBtn, loading && styles.loginBtnDisabled]} onPress={handleLogin} disabled={loading}>{loading ? <ActivityIndicator color="#FFF" /> : <><Text style={styles.loginBtnText}>Continue</Text><ArrowRight size={20} color="#FFF" /></>}</TouchableOpacity>
          <TouchableOpacity style={styles.phoneBtn} onPress={handleCarrierLogin} disabled={carrierLoading}><Phone size={18} color="#0F766E" /><View style={{ flex: 1 }}><Text style={styles.phoneTitle}>{carrierLoading ? 'Verifying...' : 'Continue with carrier verification'}</Text><Text style={styles.phoneText}>Uses Firebase PNV and Aagam backend validation.</Text></View></TouchableOpacity>
          <View style={styles.divider}><View style={styles.line} /><Text style={styles.dividerText}>Or continue with</Text><View style={styles.line} /></View>
          <View style={styles.socialRow}><TouchableOpacity style={styles.socialBtn} onPress={handleGoogleLogin} disabled={googleLoading}><Chrome size={24} color="#1E293B" /></TouchableOpacity></View>
          {googleLoading ? <ActivityIndicator style={styles.socialLoader} color="#0F766E" /> : null}
        </View>
        <View style={styles.footer}><Text style={styles.footerText}>New customer? </Text><TouchableOpacity onPress={() => navigation.navigate('SignUp')}><Text style={styles.registerText}>Create account</Text></TouchableOpacity></View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  bgCircle1: { position: 'absolute', top: -100, right: -50, width: 300, height: 300, borderRadius: 150, backgroundColor: '#CCFBF1' },
  bgCircle2: { position: 'absolute', bottom: -50, left: -100, width: 400, height: 400, borderRadius: 200, backgroundColor: '#FEF3C7' },
  content: { flex: 1, paddingHorizontal: 30, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  logoRing: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: '#14B8A6', padding: 5, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  logoCore: { width: '100%', height: '100%', borderRadius: 40, backgroundColor: '#0F766E', justifyContent: 'center', alignItems: 'center', elevation: 10 },
  logoText: { fontSize: 40, fontWeight: 'bold', color: '#FFF' },
  title: { fontSize: 32, fontWeight: '900', color: '#1E293B', letterSpacing: 1 },
  subtitle: { fontSize: 14, color: '#64748B', marginTop: 5, textAlign: 'center', fontWeight: '700' },
  glassCard: { backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 35, padding: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', elevation: 5 },
  cardTitle: { fontSize: 24, fontWeight: '900', color: '#1E293B', textAlign: 'center', marginBottom: 24 },
  inputGroup: { gap: 15 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 15, paddingHorizontal: 15, height: 55, borderWidth: 1, borderColor: '#F1F5F9' },
  input: { flex: 1, marginLeft: 10, fontSize: 16, color: '#1E293B' },
  loginBtn: { marginTop: 24, backgroundColor: '#1E293B', height: 60, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  phoneBtn: { marginTop: 14, flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: '#CCFBF1', backgroundColor: '#F0FDFA', borderRadius: 18, padding: 14 },
  phoneTitle: { color: '#115E59', fontWeight: '900' },
  phoneText: { color: '#0F766E', fontSize: 12, fontWeight: '700', marginTop: 2 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  line: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { marginHorizontal: 15, color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  socialBtn: { width: 60, height: 60, borderRadius: 20, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  socialLoader: { marginTop: 14 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  footerText: { color: '#64748B', fontSize: 14 },
  registerText: { color: '#0F766E', fontWeight: '900', fontSize: 14 },
});
