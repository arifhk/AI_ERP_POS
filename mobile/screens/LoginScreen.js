import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_BASE = 'https://ai-erp-pos.onrender.com';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const body = `username=${encodeURIComponent(email.trim())}&password=${encodeURIComponent(password)}`;
      const response = await axios.post(`${API_BASE}/login`, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      });

      const accessToken = response.data?.access_token;
      if (!accessToken) {
        throw new Error('Missing access_token');
      }

      await AsyncStorage.setItem('token', accessToken);
      navigation.replace('Main');
    } catch (caught) {
      const status = caught?.response?.status;
      const detail = caught?.response?.data?.detail;
      if (typeof detail === 'string' && detail.trim()) {
        setError(detail);
      } else if (status === 401) {
        setError('Incorrect email or password');
      } else if (status === 403) {
        setError('Account pending admin approval');
      } else {
        setError(
          'Cannot reach the API. Confirm the backend is up at https://ai-erp-pos.onrender.com.',
        );
      }
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inner}>
          <Text style={styles.brand}>AI ERP & POS</Text>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Mobile management for cashiers and admins.</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@company.com"
            placeholderTextColor="#94a3b8"
            style={styles.input}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Enter your password"
            placeholderTextColor="#94a3b8"
            style={styles.input}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={() => {
              void handleSubmit();
            }}
            disabled={submitting || !email.trim() || !password}
            style={({ pressed }) => [
              styles.button,
              (submitting || !email.trim() || !password) && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#eef2ff',
  },
  flex: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  brand: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#4f46e5',
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 28,
    fontSize: 15,
    color: '#64748b',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0f172a',
    marginBottom: 16,
  },
  error: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    overflow: 'hidden',
  },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#a5b4fc',
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
