import axios, { type InternalAxiosRequestConfig } from 'axios';
import type {
  AuthResponse,
  Product,
  Category,
  Receipt,
  ApiSuccess,
  PaginatedResponse,
} from '@kassomat/types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
});

// JWT request interceptor
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('kassomat_access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: refresh token on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('kassomat_refresh_token');
        const { data } = await axios.post<ApiSuccess<AuthResponse>>(
          `${import.meta.env.VITE_API_URL ?? '/api'}/auth/refresh`,
          { refreshToken },
        );
        localStorage.setItem('kassomat_access_token', data.data.accessToken);
        localStorage.setItem('kassomat_refresh_token', data.data.refreshToken);
        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('kassomat_access_token');
        localStorage.removeItem('kassomat_refresh_token');
      }
    }
    return Promise.reject(error);
  },
);

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<ApiSuccess<AuthResponse>>('/auth/login', { email, password });
  localStorage.setItem('kassomat_access_token', data.data.accessToken);
  localStorage.setItem('kassomat_refresh_token', data.data.refreshToken);
  return data.data;
}

export function logout(): void {
  localStorage.removeItem('kassomat_access_token');
  localStorage.removeItem('kassomat_refresh_token');
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function getProducts(params?: {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  search?: string;
}): Promise<PaginatedResponse<Product>> {
  const { data } = await api.get<ApiSuccess<PaginatedResponse<Product>>>('/products', { params });
  return data.data;
}

export async function getCategories(): Promise<Category[]> {
  const { data } = await api.get<ApiSuccess<Category[]>>('/categories');
  return data.data;
}

/**
 * Fetch up to 200 active products for the POS article grid.
 * Uses the authenticated tenant derived from the stored JWT.
 * Throws on network / auth error — callers should handle offline fallback.
 */
export async function fetchProducts(): Promise<Product[]> {
  const { data } = await api.get<ApiSuccess<PaginatedResponse<Product>>>('/products', {
    params: { pageSize: 200, isActive: 'true' },
  });
  return data.data.items;
}

/**
 * Fetch all categories for the POS article grid.
 * Uses the authenticated tenant derived from the stored JWT.
 * Throws on network / auth error — callers should handle offline fallback.
 */
export async function fetchCategories(): Promise<Category[]> {
  const { data } = await api.get<ApiSuccess<Category[]>>('/categories');
  return data.data;
}

// ── Receipts ──────────────────────────────────────────────────────────────────

export interface CreateReceiptPayload {
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    vatRate: 0 | 10 | 20;
    discount: number;
  }>;
  payment: {
    method: 'cash' | 'card' | 'online';
    amountPaid: number;
    change: number;
    tip: number;
  };
  channel: 'direct' | 'lieferando' | 'wix';
  externalOrderId?: string | null;
}

export async function createReceipt(payload: CreateReceiptPayload): Promise<Receipt> {
  const { data } = await api.post<ApiSuccess<Receipt>>('/receipts', payload);
  return data.data;
}

export async function getReceipts(params?: {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<PaginatedResponse<Receipt>> {
  const { data } = await api.get<ApiSuccess<PaginatedResponse<Receipt>>>('/receipts', { params });
  return data.data;
}

export async function cancelReceipt(receiptId: string): Promise<Receipt> {
  const { data } = await api.post<ApiSuccess<Receipt>>(`/receipts/${receiptId}/cancel`);
  return data.data;
}

export default api;
