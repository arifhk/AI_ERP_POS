import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { API_BASE, apiErrorMessage, formatCurrency, getAuthHeaders } from '../config/api';

const emptyForm = { name: '', barcode: '', price: '', stock_quantity: '0' };

export default function ProductsScreen({ navigation }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(async () => {
    const headers = await getAuthHeaders();
    if (!headers) {
      navigation.getParent()?.replace('Login');
      return;
    }
    try {
      const response = await axios.get(`${API_BASE}/products/`, { headers, timeout: 15000 });
      setProducts(Array.isArray(response.data) ? response.data : []);
      setError(null);
    } catch (caught) {
      if (caught?.response?.status === 401) {
        await AsyncStorage.clear();
        navigation.getParent()?.replace('Login');
        return;
      }
      setError(apiErrorMessage(caught, 'Unable to load products.'));
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  async function saveProduct() {
    const headers = await getAuthHeaders();
    if (!headers) {
      return;
    }
    setSaving(true);
    try {
      await axios.post(
        `${API_BASE}/products/`,
        {
          tenant_id: 1,
          branch_id: 1,
          name: form.name.trim(),
          barcode: form.barcode.trim(),
          price: Number(form.price),
          stock_quantity: Number(form.stock_quantity) || 0,
          is_active: true,
        },
        { headers, timeout: 15000 },
      );
      setModalOpen(false);
      setForm(emptyForm);
      await loadProducts();
    } catch (caught) {
      Alert.alert('Could not save', apiErrorMessage(caught, 'Product create failed.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Products</Text>
        <Pressable onPress={() => setModalOpen(true)} style={styles.addBtn}>
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator color="#4f46e5" style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{item.barcode}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.price}>{formatCurrency(item.price)}</Text>
                <Text style={styles.meta}>Stock {item.stock_quantity}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.muted}>No products yet.</Text>}
        />
      )}

      <Modal visible={modalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New product</Text>
            {['name', 'barcode', 'price', 'stock_quantity'].map((field) => (
              <TextInput
                key={field}
                value={form[field]}
                onChangeText={(value) => setForm((current) => ({ ...current, [field]: value }))}
                placeholder={field.replace('_', ' ')}
                placeholderTextColor="#94a3b8"
                keyboardType={field === 'name' || field === 'barcode' ? 'default' : 'decimal-pad'}
                style={styles.input}
              />
            ))}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModalOpen(false)} style={styles.secondary}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveProduct()}
                disabled={saving || !form.name.trim() || !form.barcode.trim()}
                style={[styles.primary, (saving || !form.name.trim()) && { opacity: 0.5 }]}
              >
                <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  addBtn: { backgroundColor: '#4f46e5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addText: { color: '#fff', fontWeight: '700' },
  error: { color: '#b91c1c', marginHorizontal: 16 },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 10,
  },
  name: { fontWeight: '700', color: '#0f172a' },
  meta: { marginTop: 4, color: '#64748b', fontSize: 12 },
  price: { fontWeight: '800', color: '#4f46e5' },
  muted: { textAlign: 'center', color: '#64748b', marginTop: 32 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12, color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    color: '#0f172a',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  secondary: { paddingHorizontal: 14, paddingVertical: 12 },
  secondaryText: { fontWeight: '700', color: '#64748b' },
  primary: { backgroundColor: '#4f46e5', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12 },
  primaryText: { color: '#fff', fontWeight: '700' },
});
