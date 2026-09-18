import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

export default function POSScreen({ navigation }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState(null);

  const loadProducts = useCallback(async () => {
    const headers = await getAuthHeaders();
    if (!headers) {
      navigation.getParent()?.replace('Login');
      return;
    }
    try {
      const response = await axios.get(`${API_BASE}/products/`, { headers, timeout: 15000 });
      const list = Array.isArray(response.data) ? response.data : [];
      setProducts(list.filter((product) => product.is_active));
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

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return products;
    }
    return products.filter(
      (product) =>
        String(product.name).toLowerCase().includes(term) ||
        String(product.barcode).toLowerCase().includes(term),
    );
  }, [products, query]);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  function addToCart(product) {
    if (product.stock_quantity <= 0) {
      Alert.alert('Out of stock', `${product.name} has no remaining stock.`);
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (!existing) {
        return [
          ...current,
          {
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: 1,
            stock_quantity: product.stock_quantity,
          },
        ];
      }
      if (existing.quantity >= existing.stock_quantity) {
        Alert.alert('Out of stock', 'Cannot add more than available quantity.');
        return current;
      }
      return current.map((item) =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
      );
    });
  }

  function changeQty(productId, delta) {
    setCart((current) =>
      current.flatMap((item) => {
        if (item.id !== productId) {
          return [item];
        }
        const next = item.quantity + delta;
        if (next <= 0) {
          return [];
        }
        if (next > item.stock_quantity) {
          return [item];
        }
        return [{ ...item, quantity: next }];
      }),
    );
  }

  async function checkout() {
    if (cart.length === 0 || checkingOut) {
      return;
    }
    const headers = await getAuthHeaders();
    if (!headers) {
      navigation.getParent()?.replace('Login');
      return;
    }
    setCheckingOut(true);
    try {
      await axios.post(
        `${API_BASE}/orders/`,
        {
          tenant_id: 1,
          branch_id: 1,
          customer_phone: phone.trim() || null,
          items: cart.map((item) => ({
            product_id: item.id,
            quantity: item.quantity,
            price: item.price,
          })),
        },
        { headers, timeout: 20000 },
      );
      setCart([]);
      setPhone('');
      Alert.alert('Sale complete', 'The order was saved and stock was updated.');
      await loadProducts();
    } catch (caught) {
      Alert.alert('Checkout failed', apiErrorMessage(caught, 'Could not place the order.'));
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Point of Sale</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search name or barcode"
        placeholderTextColor="#94a3b8"
        style={styles.search}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color="#4f46e5" style={styles.loader} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable onPress={() => addToCart(item)} style={styles.productCard}>
              <Text style={styles.productName} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.productMeta}>Stock {item.stock_quantity}</Text>
              <Text style={styles.productPrice}>{formatCurrency(item.price)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.muted}>No products found.</Text>}
        />
      )}

      <View style={styles.cart}>
        <Text style={styles.cartTitle}>Cart · {cart.length} items</Text>
        {cart.map((item) => (
          <View key={item.id} style={styles.cartRow}>
            <Text style={styles.cartName} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.qtyGroup}>
              <Pressable onPress={() => changeQty(item.id, -1)} style={styles.qtyBtn}>
                <Text style={styles.qtyBtnText}>−</Text>
              </Pressable>
              <Text style={styles.qty}>{item.quantity}</Text>
              <Pressable onPress={() => changeQty(item.id, 1)} style={styles.qtyBtn}>
                <Text style={styles.qtyBtnText}>+</Text>
              </Pressable>
            </View>
            <Text style={styles.cartLine}>{formatCurrency(item.price * item.quantity)}</Text>
          </View>
        ))}
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="Customer phone (optional)"
          placeholderTextColor="#94a3b8"
          keyboardType="phone-pad"
          style={styles.search}
        />
        <Pressable
          onPress={() => void checkout()}
          disabled={cart.length === 0 || checkingOut}
          style={[styles.checkout, (cart.length === 0 || checkingOut) && styles.checkoutDisabled]}
        >
          <Text style={styles.checkoutText}>
            {checkingOut ? 'Saving…' : `Checkout  ${formatCurrency(total)}`}
          </Text>
        </Pressable>
      </View>
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
  search: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
  error: { color: '#b91c1c', marginHorizontal: 16, marginTop: 8 },
  loader: { marginTop: 24 },
  list: { padding: 12, paddingBottom: 8 },
  row: { gap: 10 },
  productCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 10,
    minHeight: 96,
  },
  productName: { fontWeight: '700', color: '#0f172a' },
  productMeta: { marginTop: 4, fontSize: 12, color: '#64748b' },
  productPrice: { marginTop: 8, fontWeight: '800', color: '#4f46e5' },
  muted: { textAlign: 'center', color: '#64748b', marginTop: 24 },
  cart: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
    padding: 16,
    paddingBottom: 8,
    maxHeight: '42%',
  },
  cartTitle: { fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  cartRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  cartName: { flex: 1, color: '#334155', fontSize: 13 },
  qtyGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontWeight: '800', color: '#4f46e5' },
  qty: { minWidth: 18, textAlign: 'center', fontWeight: '700' },
  cartLine: { width: 88, textAlign: 'right', fontWeight: '700', color: '#0f172a' },
  checkout: {
    marginTop: 8,
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  checkoutDisabled: { backgroundColor: '#a5b4fc' },
  checkoutText: { color: '#fff', fontWeight: '800' },
});
