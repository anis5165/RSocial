import axios, { AxiosError } from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '';

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface ApiError {
  code: string;
  message: string;
}

export function getApiError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<{ error?: ApiError }>;
    if (ax.response?.data?.error) return ax.response.data.error;
    return { code: 'NETWORK_ERROR', message: ax.message || 'Network error' };
  }
  if (err instanceof Error) return { code: 'ERROR', message: err.message };
  return { code: 'ERROR', message: 'Unexpected error' };
}

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const path = window.location.pathname;
      if (!path.startsWith('/login') && !path.startsWith('/register')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
