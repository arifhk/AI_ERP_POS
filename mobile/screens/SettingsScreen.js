import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_BASE } from '../config/api';

export default function SettingsScreen({ navigation }) {
  async function handleLogout() {
    await AsyncStorage.clear();
    navigation.getParent()?.replace('Login');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.card}>
        <Text style={styles.label}>API server</Text>
        <Text style={styles.value}>{API_BASE}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>App</Text>
        <Text style={styles.value}>AI ERP & POS · Mobile</Text>
      </View>
      <Pressable onPress={() => void handleLogout()} style={styles.logout}>
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a', paddingTop: 8, marginBottom: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 12,
  },
  label: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  value: { marginTop: 6, fontSize: 15, color: '#0f172a', fontWeight: '600' },
  logout: {
    marginTop: 12,
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { color: '#be123c', fontWeight: '800' },
});
