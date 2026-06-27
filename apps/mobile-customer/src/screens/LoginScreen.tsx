import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuthStore } from '@aagam/mobile-shared';
import { Mail, Lock, ArrowRight, Chrome } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '@env';

const { width } = Dimensions.get('window');

export const LoginScreen = () => {
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const login = useAuthStore((state) => state.login);
  const googleLogin = useAuthStore((state) => state.googleLogin);

  React.useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: false,
    });
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true);
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;
      if (!idToken) {
        throw new Error('Google token missing');
      }
      await googleLogin(idToken);
    } catch (error: any) {
      if (error?.code === statusCodes.SIGN_IN_CANCELLED) return;
      Alert.alert('Google Sign-In Failed', error?.message || 'Unable to sign in with Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.bgCircle1} />
      <View style={styles.bgCircle2} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <View style={styles.header}>
          <View style={styles.logoRing}>
            <View style={styles.logoCore}>
              <Text style={styles.logoText}>A</Text>
            </View>
          </View>
          <Text style={styles.title}>AAGAM</Text>
          <Text style={styles.subtitle}>Fast commerce, live delivery, zero guesswork</Text>
        </View>

        <View style={styles.glassCard}>
          <Text style={styles.cardTitle}>Sign In</Text>

          <View style={styles.inputGroup}>
            <View style={styles.inputWrapper}>
              <Mail size={18} color="#94A3B8" />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#94A3B8"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputWrapper}>
              <Lock size={18} color="#94A3B8" />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>
          </View>

          <TouchableOpacity style={styles.forgotBtn}>
            <Text style={styles.forgotText}>Recovery Password</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text style={styles.loginBtnText}>Continue</Text>
                <ArrowRight size={20} color="#FFF" />
              </>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>Or continue with</Text>
            <View style={styles.line} />
          </View>

          <View style={styles.socialRow}>
            <TouchableOpacity style={styles.socialBtn} onPress={handleGoogleLogin} disabled={googleLoading}>
              <Chrome size={24} color="#1E293B" />
            </TouchableOpacity>
          </View>
          {googleLoading ? <ActivityIndicator style={styles.socialLoader} color="#0F766E" /> : null}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Not a member? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
            <Text style={styles.registerText}>Register now</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  bgCircle1: { position: 'absolute', top: -100, right: -50, width: 300, height: 300, borderRadius: 150, backgroundColor: '#CCFBF1' },
  bgCircle2: { position: 'absolute', bottom: -50, left: -100, width: 400, height: 400, borderRadius: 200, backgroundColor: '#FEF3C7' },
  content: { flex: 1, paddingHorizontal: 30, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  logoRing: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: '#14B8A6', padding: 5, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  logoCore: { width: '100%', height: '100%', borderRadius: 40, backgroundColor: '#0F766E', justifyContent: 'center', alignItems: 'center', elevation: 10, shadowColor: '#0F766E', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 },
  logoText: { fontSize: 40, fontWeight: 'bold', color: '#FFF' },
  title: { fontSize: 32, fontWeight: '900', color: '#1E293B', letterSpacing: 1 },
  subtitle: { fontSize: 14, color: '#64748B', marginTop: 5 },
  glassCard: { backgroundColor: 'rgba(255, 255, 255, 0.8)', borderRadius: 35, padding: 30, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.5)', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 30 },
  cardTitle: { fontSize: 24, fontWeight: 'bold', color: '#1E293B', textAlign: 'center', marginBottom: 30 },
  inputGroup: { gap: 15 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 15, paddingHorizontal: 15, height: 55, borderWidth: 1, borderColor: '#F1F5F9' },
  input: { flex: 1, marginLeft: 10, fontSize: 16, color: '#1E293B' },
  forgotBtn: { alignSelf: 'flex-end', marginTop: 15, marginBottom: 30 },
  forgotText: { color: '#64748B', fontSize: 14 },
  loginBtn: { backgroundColor: '#1E293B', height: 60, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 10 },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 30 },
  line: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { marginHorizontal: 15, color: '#94A3B8', fontSize: 12 },
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  socialBtn: { width: 60, height: 60, borderRadius: 20, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  socialLoader: { marginTop: 14 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 40 },
  footerText: { color: '#64748B', fontSize: 14 },
  registerText: { color: '#0F766E', fontWeight: 'bold', fontSize: 14 },
});
