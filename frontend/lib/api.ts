import axios from 'axios';

// Empty string = relative URLs, handled by Next.js rewrites (→ BACKEND_URL on server).
// Set NEXT_PUBLIC_API_URL=http://localhost:8000 in .env.local for local dev only.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('rw_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined' && error?.response?.status === 401) {
      localStorage.removeItem('rw_token');
      localStorage.removeItem('rw_user');
      document.cookie = 'rw_token=; Max-Age=0; path=/';
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Types
export interface User {
  id: number;
  email: string;
  name: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Entity {
  id: number;
  name: string;
  name_zh?: string;
  type: string;
  tier: number;
  aliases: string[];
}

export interface Source {
  id: string;
  name: string;
  url: string;
  language: string;
  type: string;
  active: boolean;
}

export interface Article {
  id: number;
  title: string;
  url: string;
  source: Source;
  published_at: string;
  raw_text_en?: string;
  raw_text_original?: string;
  scraped_at?: string;
  early_signal: boolean;
  policy_signal: boolean;
  entities: Entity[];
  topics: string[];
}

export interface PaginatedArticles {
  items: Article[];
  total: number;
  limit: number;
  offset: number;
}

export interface Settings {
  retention_days: number;
  scraper_frequency_hours?: number;
}

export interface ArticleFilters {
  entity_id?: number;
  source_id?: number;
  topic?: string;
  tier?: number;
  has_entities?: boolean;
  from_date?: string;
  to_date?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// API calls
export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/api/v1/auth/login', { email, password }),
};

export const articlesApi = {
  list: (filters?: ArticleFilters) =>
    api.get<PaginatedArticles | Article[]>('/api/v1/articles', { params: filters }),
  get: (id: string | number) => api.get<Article>(`/api/v1/articles/${id}`),
  delete: (id: string | number) => api.delete(`/api/v1/articles/${id}`),
};

export const entitiesApi = {
  list: () => api.get<Entity[]>('/api/v1/entities'),
  create: (data: Partial<Entity>) => api.post<Entity>('/api/v1/entities', data),
  update: (id: number, data: Partial<Entity>) => api.put<Entity>(`/api/v1/entities/${id}`, data),
  delete: (id: number) => api.delete(`/api/v1/entities/${id}`),
};

export const sourcesApi = {
  list: () => api.get<Source[]>('/api/v1/sources'),
  update: (id: string, url: string, active?: boolean) =>
    api.put<Source>(`/api/v1/sources/${id}`, { url, active }),
};

export interface ScrapeRun {
  id: string;
  started_at: string;
  finished_at?: string;
  articles_added: number;
  articles_translated?: number;
  articles_translation_failed?: number;
  articles_tagged?: number;
  articles_tagging_failed?: number;
  status: 'success' | 'error' | 'running' | 'interrupted';
  error_message?: string;
}

export const scrapeApi = {
  run: () => api.post('/api/v1/scrape'),
  runs: () => api.get<ScrapeRun[]>('/api/v1/scrape/runs'),
};

export const translateApi = {
  run: () => api.post('/api/v1/translate'),
};

export const settingsApi = {
  get: () => api.get<Settings>('/api/v1/settings'),
  update: (data: Settings) => api.put<Settings>('/api/v1/settings', data),
};

export const getExportUrl = (filters: ArticleFilters): string => {
  const params = new URLSearchParams();
  if (filters.entity_id) params.set('entity_id', String(filters.entity_id));
  if (filters.source_id) params.set('source_id', String(filters.source_id));
  if (filters.topic) params.set('topic', filters.topic);
  if (filters.from_date) params.set('from_date', filters.from_date);
  if (filters.to_date) params.set('to_date', filters.to_date);
  if (filters.search) params.set('search', filters.search);
  return `${API_BASE}/api/v1/export/csv?${params.toString()}`;
};
