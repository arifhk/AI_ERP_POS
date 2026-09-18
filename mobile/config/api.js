import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE = 'https://ai-erp-pos.onrender.com';

export async function getAuthHeaders() {
  const token = await AsyncStorage.getItem('token');
  if (!token) {
    return null;
  }
  return { Authorization: `Bearer ${token}` };
}

export function formatCurrency(amount) {
  return `৳ ${Number(amount).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function apiErrorMessage(caught, fallback) {
  const detail = caught?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  return fallback;
}
