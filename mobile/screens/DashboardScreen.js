import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { API_BASE, formatCurrency, getAuthHeaders } from '../config/api';

function sumOrders(payload) {
  if (!Array.isArray(payload)) {
    return 0;
  }
  return payload.reduce((total, row) => {
    if (!row || typeof row.total_amount !== 'number') {
      return total;
    }
    return total + row.total_amount;
  }, 0);
}

function sumExpenses(payload) {
  if (!Array.isArray(payload)) {
    return 0;
  }
  return payload.reduce((total, row) => {
    if (!row || typeof row.amount !== 'number') {
      return total;
    }
    return total + row.amount;
  }, 0);
}

export default function DashboardScreen({ navigation }) {
  const [totalSales, setTotalSales] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadDashboard = useCallback(async () => {
    const headers = await getAuthHeaders();
    if (!headers) {
      navigation.getParent()?.replace('Login');
      return;
    }

    try {
      const [ordersRes, expensesRes] = await Promise.all([
        axios.get(`${API_BASE}/orders/`, { headers, timeout: 15000 }),
        axios.get(`${API_BASE}/expenses/`, { headers, timeout: 15000 }),
      ]);
      setTotalSales(sumOrders(ordersRes.data));
      setTotalExpenses(sumExpenses(expensesRes.data));
      setError(null);
    } catch (caught) {
      if (caught?.response?.status === 401) {
        await AsyncStorage.clear();
        navigation.getParent()?.replace('Login');
        return;
      }
      setError('Unable to load dashboard data. Pull to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigation]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  async function handleLogout() {
    await AsyncStorage.clear();
    navigation.getParent()?.replace('Login');
  }

  const cashInHand = totalSales - totalExpenses;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadDashboard();
            }}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>Companion</Text>
            <Text style={styles.title}>Dashboard</Text>
          </View>
          <Pressable
            onPress={() => {
              void handleLogout();
            }}
            style={styles.logout}
          >
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#4f46e5" />
            <Text style={styles.muted}>Loading totals…</Text>
          </View>
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={[styles.card, styles.salesCard]}>
              <Text style={styles.cardLabel}>Total Sales</Text>
              <Text style={styles.cardValue}>{formatCurrency(totalSales)}</Text>
              <Text style={styles.cardHint}>Sum of POS orders</Text>
            </View>

            <View style={[styles.card, styles.expenseCard]}>
              <Text style={[styles.cardLabel, styles.expenseLabel]}>Total Expenses</Text>
              <Text style={[styles.cardValue, styles.expenseValue]}>
                {formatCurrency(totalExpenses)}
              </Text>
              <Text style={styles.cardHint}>Petty cash and logged spend</Text>
            </View>

            <View style={[styles.card, styles.cashCard]}>
              <Text style={[styles.cardLabel, styles.cashLabel]}>Cash in Hand</Text>
              <Text
                style={[
                  styles.cardValue,
                  cashInHand >= 0 ? styles.cashValue : styles.negativeValue,
                ]}
              >
                {formatCurrency(cashInHand)}
              </Text>
              <Text style={styles.cardHint}>Net balance (sales − expenses)</Text>
            </View>

            <Text style={styles.section}>Quick actions</Text>
            <View style={styles.actions}>
              {[
                { name: 'POS', label: 'Open POS' },
                { name: 'Products', label: 'Products' },
                { name: 'Orders', label: 'Orders' },
                { name: 'Settings', label: 'Settings' },
              ].map((action) => (
                <Pressable
                  key={action.name}
                  onPress={() => navigation.navigate(action.name)}
                  style={styles.actionBtn}
                >
                  <Text style={styles.actionText}>{action.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#4f46e5',
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
  },
  logout: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  logoutText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  centered: {
    paddingTop: 80,
    alignItems: 'center',
    gap: 12,
  },
  muted: {
    color: '#64748b',
  },
  error: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  salesCard: {
    borderColor: '#e2e8f0',
  },
  expenseCard: {
    borderColor: '#fecdd3',
    backgroundColor: '#fff1f2',
  },
  cashCard: {
    borderColor: '#a7f3d0',
    backgroundColor: '#ecfdf5',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  expenseLabel: {
    color: '#e11d48',
  },
  cashLabel: {
    color: '#047857',
  },
  cardValue: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
  },
  expenseValue: {
    color: '#9f1239',
  },
  cashValue: {
    color: '#047857',
  },
  negativeValue: {
    color: '#be123c',
  },
  cardHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b',
  },
  section: {
    marginTop: 8,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionBtn: {
    width: '47%',
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  actionText: {
    fontWeight: '800',
    color: '#4338ca',
  },
});
