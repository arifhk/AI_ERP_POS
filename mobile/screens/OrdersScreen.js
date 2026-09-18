import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { API_BASE, apiErrorMessage, formatCurrency, getAuthHeaders } from '../config/api';

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OrdersScreen({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadOrders = useCallback(async () => {
    const headers = await getAuthHeaders();
    if (!headers) {
      navigation.getParent()?.replace('Login');
      return;
    }
    try {
      const response = await axios.get(`${API_BASE}/orders/`, { headers, timeout: 15000 });
      setOrders(Array.isArray(response.data) ? response.data : []);
      setError(null);
    } catch (caught) {
      if (caught?.response?.status === 401) {
        await AsyncStorage.clear();
        navigation.getParent()?.replace('Login');
        return;
      }
      setError(apiErrorMessage(caught, 'Unable to load orders.'));
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Orders</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator color="#4f46e5" style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          onRefresh={() => {
            setLoading(true);
            void loadOrders();
          }}
          refreshing={false}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.orderId}>#{item.id}</Text>
                <Text style={styles.amount}>{formatCurrency(item.total_amount)}</Text>
              </View>
              <Text style={styles.meta}>{formatDate(item.created_at)}</Text>
              {item.customer_phone ? (
                <Text style={styles.meta}>Phone {item.customer_phone}</Text>
              ) : null}
              {(item.items || []).map((line) => (
                <Text key={line.id} style={styles.line}>
                  {(line.name || `Product #${line.product_id}`)} × {line.quantity}
                </Text>
              ))}
            </View>
          )}
          ListEmptyComponent={<Text style={styles.muted}>No sales yet. Checkout from POS.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  error: { color: '#b91c1c', marginHorizontal: 16, marginTop: 8 },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontWeight: '800', color: '#0f172a' },
  amount: { fontWeight: '800', color: '#4f46e5' },
  meta: { marginTop: 4, color: '#64748b', fontSize: 12 },
  line: { marginTop: 6, color: '#334155', fontSize: 13 },
  muted: { textAlign: 'center', color: '#64748b', marginTop: 32 },
});
