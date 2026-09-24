import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BottomSheet, Host } from '@expo/ui';
import axios from 'axios';

import { API_BASE, apiErrorMessage, formatCurrency, getAuthHeaders } from '../config/api';

const VAT_RATE = 0.05;
const BARCODE_TYPES = ['code128', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code39', 'qr'];

export default function POSScreen({ navigation }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);

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

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const vat = subtotal * VAT_RATE;
  const grandTotal = subtotal + vat;
  const units = cart.reduce((sum, item) => sum + item.quantity, 0);

  const cartRef = useRef(cart);
  cartRef.current = cart;

  const addToCart = useCallback((product) => {
    const current = cartRef.current;
    const existing = current.find((item) => item.id === product.id);
    if (product.stock_quantity <= 0 || (existing && existing.quantity >= existing.stock_quantity)) {
      Alert.alert('Out of stock', `${product.name} has no remaining stock to add.`);
      return false;
    }
    setCart((rows) => {
      const inCart = rows.find((item) => item.id === product.id);
      if (!inCart) {
        return [
          ...rows,
          {
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: 1,
            stock_quantity: product.stock_quantity,
          },
        ];
      }
      if (inCart.quantity >= inCart.stock_quantity) {
        return rows;
      }
      return rows.map((item) =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
      );
    });
    return true;
  }, []);

  function addByBarcode(code) {
    const term = String(code).trim().toLowerCase();
    if (!term) {
      return;
    }
    const match = products.find((product) => String(product.barcode).toLowerCase() === term);
    if (!match) {
      Alert.alert('Not found', `No product matches barcode ${code.trim()}.`);
      return;
    }
    if (addToCart(match)) {
      setQuery('');
      setCartOpen(true);
    }
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
          Alert.alert('Out of stock', 'Cannot add more than available quantity.');
          return [item];
        }
        return [{ ...item, quantity: next }];
      }),
    );
  }

  async function openScanner() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera required', 'Allow camera access to scan product barcodes.');
        return;
      }
    }
    scanLock.current = false;
    setScanning(true);
  }

  function onBarcodeScanned(result) {
    if (scanLock.current) {
      return;
    }
    scanLock.current = true;
    setScanning(false);
    addByBarcode(result?.data ?? '');
  }

  function submitSearch() {
    const term = query.trim().toLowerCase();
    if (!term) {
      return;
    }
    const exact = products.find((product) => String(product.barcode).toLowerCase() === term);
    const match = exact ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (!match) {
      return;
    }
    if (addToCart(match)) {
      setQuery('');
    }
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
      setCartOpen(false);
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
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Point of Sale</Text>
          <Text style={styles.subtitle}>Scan a barcode or tap a product.</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submitSearch}
          placeholder="Search name or barcode"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.search}
        />
        <Pressable onPress={() => void openScanner()} style={styles.scanButton}>
          <Text style={styles.scanButtonText}>Scan</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color="#4f46e5" style={styles.loader} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={filtered.length > 0 ? styles.row : undefined}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const out = item.stock_quantity <= 0;
            return (
              <Pressable
                onPress={() => addToCart(item)}
                style={[styles.productCard, out && styles.productOut]}
              >
                <Text style={styles.productName} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.productMeta} numberOfLines={1}>
                  {item.barcode}
                </Text>
                <View style={styles.productFooter}>
                  <Text style={styles.productMeta}>Stock {item.stock_quantity}</Text>
                  <Text style={styles.productPrice}>{formatCurrency(item.price)}</Text>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.muted}>No matching products.</Text>}
        />
      )}

      <Pressable onPress={() => setCartOpen(true)} style={styles.fab}>
        <Text style={styles.fabText}>Cart</Text>
        <View style={styles.fabBadge}>
          <Text style={styles.fabBadgeText}>{units}</Text>
        </View>
      </Pressable>

      <Host style={styles.sheetHost}>
        <BottomSheet
          isPresented={cartOpen}
          onDismiss={() => setCartOpen(false)}
          snapPoints={['half', 'full']}
        >
          <View style={styles.sheet}>
            <Text style={styles.cartTitle}>Current order</Text>
            <Text style={styles.cartMeta}>
              {cart.length === 1 ? '1 item in cart' : `${cart.length} items in cart`}
            </Text>
            <ScrollView style={styles.cartList} contentContainerStyle={styles.cartListContent}>
              {cart.length === 0 ? (
                <Text style={styles.muted}>Tap a product to start billing.</Text>
              ) : (
                cart.map((item) => (
                  <View key={item.id} style={styles.cartCard}>
                    <View style={styles.cartTop}>
                      <Text style={styles.cartName} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={styles.cartLine}>{formatCurrency(item.price * item.quantity)}</Text>
                    </View>
                    <Text style={styles.productMeta}>{formatCurrency(item.price)} each</Text>
                    <View style={styles.cartActions}>
                      <View style={styles.qtyGroup}>
                        <Pressable onPress={() => changeQty(item.id, -1)} style={styles.qtyBtn}>
                          <Text style={styles.qtyBtnText}>−</Text>
                        </Pressable>
                        <Text style={styles.qty}>{item.quantity}</Text>
                        <Pressable
                          onPress={() => changeQty(item.id, 1)}
                          disabled={item.quantity >= item.stock_quantity}
                          style={styles.qtyBtn}
                        >
                          <Text style={styles.qtyBtnText}>+</Text>
                        </Pressable>
                      </View>
                      <Pressable onPress={() => changeQty(item.id, -item.quantity)}>
                        <Text style={styles.remove}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={styles.totals}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalLabel}>{formatCurrency(subtotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>VAT (5%)</Text>
                <Text style={styles.totalLabel}>{formatCurrency(vat)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.grandLabel}>Grand total</Text>
                <Text style={styles.grandLabel}>{formatCurrency(grandTotal)}</Text>
              </View>
            </View>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Customer phone (optional)"
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
              style={styles.phone}
            />
            <Pressable
              onPress={() => void checkout()}
              disabled={cart.length === 0 || checkingOut}
              style={[styles.checkout, (cart.length === 0 || checkingOut) && styles.checkoutDisabled]}
            >
              <Text style={styles.checkoutText}>
                {checkingOut ? 'Processing...' : 'Checkout / Pay Now'}
              </Text>
            </Pressable>
          </View>
        </BottomSheet>
      </Host>

      {scanning ? (
        <View style={styles.cameraLayer}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={onBarcodeScanned}
          />
          <SafeAreaView style={styles.cameraChrome} edges={['top', 'bottom']}>
            <Text style={styles.cameraHint}>Point the camera at a product barcode</Text>
            <Pressable onPress={() => setScanning(false)} style={styles.cameraClose}>
              <Text style={styles.cameraCloseText}>Close</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  header: { paddingHorizontal: 16, paddingTop: 8 },
  headerText: { gap: 2 },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { color: '#64748b', fontSize: 13 },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  search: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
  scanButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  scanButtonText: { color: '#fff', fontWeight: '800' },
  error: { color: '#b91c1c', marginHorizontal: 16, marginTop: 8 },
  loader: { marginTop: 24 },
  list: { padding: 12, paddingBottom: 96 },
  row: { gap: 10 },
  productCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 10,
    minHeight: 112,
  },
  productOut: { opacity: 0.5 },
  productName: { fontWeight: '700', color: '#0f172a' },
  productMeta: { marginTop: 4, fontSize: 12, color: '#64748b' },
  productFooter: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  productPrice: { fontWeight: '800', color: '#4f46e5' },
  muted: { textAlign: 'center', color: '#64748b', marginTop: 24 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4f46e5',
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 18,
    elevation: 4,
  },
  fabText: { color: '#fff', fontWeight: '800' },
  fabBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  fabBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  sheetHost: { ...StyleSheet.absoluteFillObject, pointerEvents: 'box-none' },
  sheet: { paddingHorizontal: 16, paddingBottom: 24, maxHeight: 560 },
  cartTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  cartMeta: { color: '#64748b', marginTop: 2, marginBottom: 8 },
  cartList: { maxHeight: 240 },
  cartListContent: { paddingBottom: 8 },
  cartCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  cartTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cartName: { flex: 1, fontWeight: '700', color: '#0f172a' },
  cartLine: { fontWeight: '700', color: '#0f172a' },
  cartActions: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qtyGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontWeight: '800', color: '#334155' },
  qty: { minWidth: 18, textAlign: 'center', fontWeight: '700' },
  remove: { color: '#ef4444', fontWeight: '700', fontSize: 12 },
  totals: { gap: 6, marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { color: '#475569' },
  grandLabel: { fontWeight: '800', color: '#0f172a', fontSize: 16 },
  phone: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
  checkout: {
    marginTop: 12,
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  checkoutDisabled: { backgroundColor: '#cbd5e1' },
  checkoutText: { color: '#fff', fontWeight: '800' },
  cameraLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 20 },
  camera: { flex: 1 },
  cameraChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    gap: 12,
  },
  cameraHint: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  cameraClose: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  cameraCloseText: { fontWeight: '800', color: '#0f172a' },
});
