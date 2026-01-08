import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add API key to requests
api.interceptors.request.use((config) => {
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('apiKey') : null;
  if (apiKey) {
    config.headers.Authorization = `Bearer ${apiKey}`;
  }
  return config;
});

// Handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login or clear session
      if (typeof window !== 'undefined') {
        localStorage.removeItem('apiKey');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ===========================================
// Products API
// ===========================================

export const productsApi = {
  list: async (params?: { page?: number; pageSize?: number; status?: string }) => {
    const response = await api.get('/products', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/products/${id}`);
    return response.data;
  },

  create: async (data: {
    name: string;
    description?: string;
    sku?: string;
    gtin?: string;
    attributes?: Record<string, unknown>;
  }) => {
    const response = await api.post('/products', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Parameters<typeof productsApi.create>[0]>) => {
    const response = await api.patch(`/products/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/products/${id}`);
    return response.data;
  },
};

// ===========================================
// Passports API
// ===========================================

export const passportsApi = {
  list: async (params?: { page?: number; pageSize?: number; productId?: string }) => {
    const response = await api.get('/passports', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/passports/${id}`);
    return response.data;
  },

  create: async (data: { productId: string; data: Record<string, unknown> }) => {
    const response = await api.post('/passports', data);
    return response.data;
  },

  generateQr: async (id: string) => {
    const response = await api.post(`/passports/${id}/qr`);
    return response.data;
  },

  anchor: async (id: string) => {
    const response = await api.post(`/passports/${id}/anchor`);
    return response.data;
  },
};

// ===========================================
// Credentials API
// ===========================================

export const credentialsApi = {
  list: async (params?: { page?: number; pageSize?: number; status?: string }) => {
    const response = await api.get('/credentials', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/credentials/${id}`);
    return response.data;
  },

  issue: async (data: {
    schemaId: string;
    subjectName: string;
    subjectEmail?: string;
    claims: Record<string, unknown>;
  }) => {
    const response = await api.post('/credentials/issue', data);
    return response.data;
  },

  revoke: async (id: string, reason?: string) => {
    const response = await api.post(`/credentials/${id}/revoke`, { reason });
    return response.data;
  },

  verify: async (vcJwt: string) => {
    const response = await api.post('/credentials/verify', { vcJwt });
    return response.data;
  },
};

// ===========================================
// Schemas API
// ===========================================

export const schemasApi = {
  list: async () => {
    const response = await api.get('/schemas');
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/schemas/${id}`);
    return response.data;
  },
};

// ===========================================
// Merchants/Traders API
// ===========================================

export const merchantsApi = {
  list: async (params?: { page?: number; pageSize?: number; kybStatus?: string }) => {
    const response = await api.get('/traders', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/traders/${id}`);
    return response.data;
  },

  create: async (data: {
    legalName: string;
    tradingName?: string;
    registrationNumber?: string;
    vatNumber?: string;
    country: string;
  }) => {
    const response = await api.post('/traders', data);
    return response.data;
  },

  getCompliance: async (id: string) => {
    const response = await api.get(`/traders/${id}/compliance`);
    return response.data;
  },
};

// ===========================================
// KYB API
// ===========================================

export const kybApi = {
  startVerification: async (data: {
    merchantId?: string;
    legalName: string;
    vatNumber?: string;
    registrationNumber?: string;
    country: string;
  }) => {
    const response = await api.post('/kyb/verify', data);
    return response.data;
  },

  getStatus: async (id: string) => {
    const response = await api.get(`/kyb/${id}`);
    return response.data;
  },

  getReport: async (id: string) => {
    const response = await api.get(`/kyb/${id}/report`);
    return response.data;
  },
};

// ===========================================
// Sanctions API
// ===========================================

export const sanctionsApi = {
  check: async (data: {
    merchantId?: string;
    entityName: string;
    entityType?: 'BUSINESS' | 'INDIVIDUAL';
  }) => {
    const response = await api.post('/sanctions/check', data);
    return response.data;
  },
};

// ===========================================
// Organization API
// ===========================================

export const organizationApi = {
  getCurrent: async () => {
    const response = await api.get('/auth/organizations/me');
    return response.data;
  },

  getApiKeys: async () => {
    const response = await api.get('/auth/api-keys');
    return response.data;
  },

  createApiKey: async (data: { name: string; scopes?: string[] }) => {
    const response = await api.post('/auth/api-keys', data);
    return response.data;
  },

  revokeApiKey: async (keyId: string) => {
    const response = await api.delete(`/auth/api-keys/${keyId}`);
    return response.data;
  },
};

export default api;
