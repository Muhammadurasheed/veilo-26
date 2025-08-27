import axios from 'axios';
import { logger } from './logger';
import { tokenManager } from './tokenManager';

// API Configuration - Use proxy in development, direct URL in production
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '' : 'http://localhost:3000');

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// State for handling refresh token
let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  
  failedQueue = [];
};

// Request interceptor for authentication and logging
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const authHeaders = tokenManager.getAuthHeaders();
    Object.assign(config.headers, authHeaders);
    
    logger.apiRequest(config.method?.toUpperCase() || 'UNKNOWN', config.url || '', config.data);
    return config;
  },
  (error) => {
    logger.error('API Request Error', error);
    return Promise.reject(error);
  }
);

// Response interceptor with token refresh logic
api.interceptors.response.use(
  (response) => {
    logger.apiResponse(
      response.config.method?.toUpperCase() || 'UNKNOWN',
      response.config.url || '',
      response.status,
      response.data
    );
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status || 0;
    const url = error.config?.url || 'unknown';
    const method = error.config?.method?.toUpperCase() || 'UNKNOWN';
    
    logger.apiResponse(method, url, status, error.response?.data);
    
    // Handle 401 errors with token refresh
    if (status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          return api(originalRequest);
        }).catch((err) => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = tokenManager.getRefreshToken();
      
      if (refreshToken) {
        try {
          const response = await api.post('/api/auth/refresh-token', { refreshToken });
          
          if (response.data?.success && response.data?.data?.token) {
            const { token: newAccessToken, refreshToken: newRefreshToken } = response.data.data;
            tokenManager.setToken(newAccessToken);
            tokenManager.setRefreshToken(newRefreshToken);
            
            logger.debug('Token refreshed successfully via interceptor');
            processQueue(null, newAccessToken);
            
            // Update original request with new token
            originalRequest.headers['x-auth-token'] = newAccessToken;
            
            return api(originalRequest);
          } else {
            throw new Error('Invalid refresh response');
          }
        } catch (refreshError) {
          logger.warn('Token refresh failed, clearing all tokens');
          tokenManager.clearAllTokens();
          processQueue(refreshError, null);
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      } else {
        logger.warn('No refresh token available, clearing tokens');
        tokenManager.clearAllTokens();
        isRefreshing = false;
        return Promise.reject(error);
      }
    }
    
    return Promise.reject(error);
  }
);

// Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Token management utilities
export const setAdminToken = (token: string) => {
  localStorage.setItem('admin_token', token);
  localStorage.setItem('token', token); 
  localStorage.setItem('veilo-auth-token', token);
  
  // Set axios default header for all subsequent requests
  api.defaults.headers.common['x-auth-token'] = token;
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  
  console.log('🔐 Admin token set:', { 
    token: token.substring(0, 20) + '...', 
    hasHeader: !!api.defaults.headers.common['x-auth-token'] 
  });
};

// Generic API request function
export const apiRequest = async <T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  url: string,
  data?: any,
  config?: any
): Promise<ApiResponse<T>> => {
  try {
    const response = await api.request({
      method,
      url,
      data,
      ...config,
    });
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'An error occurred',
    };
  }
};

// User API methods
export const UserApi = {
  // Register new user (anonymous or with credentials)
  async register(userData: { 
    alias?: string; 
    avatarIndex?: number; 
    email?: string; 
    password?: string; 
  } = {}) {
    logger.accountCreation('Starting registration', userData);
    const response = await api.post('/api/auth/register', userData);
    
    if (response.data?.success && response.data?.data?.token) {
      tokenManager.setToken(response.data.data.token);
      if (response.data.data.refreshToken) {
        tokenManager.setRefreshToken(response.data.data.refreshToken);
      }
      logger.accountCreation('Registration successful - token saved');
    }
    
    return response.data;
  },

  // Login with email and password
  async login(credentials: { email: string; password: string }) {
    logger.userAction('Login attempt', { email: credentials.email });
    const response = await api.post('/api/auth/login', credentials);
    
    if (response.data?.success && response.data?.data?.token) {
      tokenManager.setToken(response.data.data.token);
      if (response.data.data.refreshToken) {
        tokenManager.setRefreshToken(response.data.data.refreshToken);
      }
      logger.userAction('Login successful - token saved');
    }
    
    return response.data;
  },

  // Authenticate with token
  async authenticate(token: string) {
    const response = await api.get('/api/auth/verify', {
      headers: { 'x-auth-token': token }
    });
    return response.data;
  },

  // Refresh token
  async refreshToken(token: string) {
    const response = await api.post('/api/auth/refresh-token', { refreshToken: token });
    
    if (response.data?.success && response.data?.data?.token) {
      tokenManager.setToken(response.data.data.token);
      if (response.data.data.refreshToken) {
        tokenManager.setRefreshToken(response.data.data.refreshToken);
      }
      logger.debug('Token refreshed successfully');
    }
    
    return response.data;
  },

  // Update user profile
  async updateProfile(updates: any) {
    logger.userAction('Profile update', updates);
    const response = await api.put('/api/auth/profile', updates);
    return response.data;
  },

  // Refresh identity
  async refreshIdentity() {
    const response = await api.post('/api/auth/refresh-identity');
    return response.data;
  },

  // Update avatar
  async updateAvatar(avatarUrl: string) {
    const response = await api.put('/api/auth/avatar', { avatarUrl });
    return response.data;
  },

  // Register expert account
  async registerExpertAccount(expertData: any) {
    const response = await api.post('/api/experts/register', expertData);
    return response.data;
  }
};

// Expert API methods
export const ExpertApi = {
  async register(expertData: any) {
    return apiRequest('POST', '/api/experts/register', expertData);
  },

  async registerExpert(expertData: any) {
    return apiRequest('POST', '/api/experts/register', expertData);
  },

  async getExperts() {
    return apiRequest('GET', '/api/experts');
  },

  async getExpert(id: string) {
    return apiRequest('GET', `/api/experts/${id}`);
  },

  async getById(id: string) {
    return apiRequest('GET', `/api/expert/${id}`);
  },

  async getAll() {
    return apiRequest('GET', '/api/experts');
  },

  async updateExpert(id: string, updates: any) {
    return apiRequest('PUT', `/api/experts/${id}`, updates);
  },

  async uploadDocument(id: string, formData: FormData) {
    return apiRequest('POST', `/api/experts/${id}/document`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  async uploadVerificationDocument(expertId: string, file: File, type: string, progressCallback?: (progress: number) => void) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', type);
    
    return apiRequest('POST', `/api/experts/${expertId}/document`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent: any) => {
        if (progressCallback && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          progressCallback(progress);
        }
      }
    });
  },

  async getDocuments(id: string) {
    return apiRequest('GET', `/api/experts/${id}/documents`);
  }
};

// Admin API methods
export const AdminApi = {
  async login(credentials: { email: string; password: string }) {
    console.log('🔐 AdminApi.login called with:', { email: credentials.email, hasPassword: !!credentials.password });
    
    const response = await apiRequest('POST', '/api/auth/admin/login', {
      email: credentials.email,
      password: credentials.password
    });
    
    console.log('📡 AdminApi.login response:', {
      success: response.success,
      hasData: !!response.data,
      hasToken: !!response.data?.token,
      userRole: response.data?.user?.role,
      adminRole: response.data?.admin?.role,
      fullResponseStructure: response
    });
    
    return response;
  },

  async getUsers(params?: any) {
    return apiRequest('GET', '/api/admin/users', null, { params });
  },

  async getExperts(params?: any) {
    return apiRequest('GET', '/api/admin/experts', null, { params });
  },

  // Get experts with advanced filtering and pagination
  async getExpertsAdvanced(params: {
    page?: number;
    limit?: number;
    status?: string;
    verificationLevel?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}) {
    // Filter out placeholder values
    const filteredParams = Object.fromEntries(
      Object.entries(params).filter(([key, value]) => 
        value !== undefined && 
        value !== 'all_statuses' && 
        value !== 'all_levels' &&
        value !== ''
      )
    );
    
    return apiRequest('GET', '/api/admin/experts/advanced', null, { params: filteredParams });
  },

  // Bulk actions on experts
  async bulkExpertAction(data: {
    expertIds: string[];
    action: 'approve' | 'reject' | 'suspend' | 'reactivate';
    notes?: string;
  }) {
    return apiRequest('POST', '/api/admin/experts/bulk-action', data);
  },

  // Platform analytics overview
  async getPlatformOverview(params: { timeframe?: string } = {}) {
    return apiRequest('GET', '/api/admin/analytics/platform-overview', null, { params });
  },

  async getPendingExperts() {
    return apiRequest('GET', '/api/admin/experts/pending');
  },

  async verifyExpert(expertId: string, data: { verificationLevel: string; status: string; feedback?: string }) {
    return apiRequest('PATCH', `/api/admin/experts/${expertId}/verify`, data);
  },

  async approveExpert(expertId: string) {
    return apiRequest('POST', `/api/admin/experts/${expertId}/approve`);
  },

  async rejectExpert(expertId: string, reason: string) {
    return apiRequest('POST', `/api/admin/experts/${expertId}/reject`, { reason });
  },

  async moderateContent(contentId: string, action: string) {
    return apiRequest('POST', `/api/admin/content/${contentId}/moderate`, { action });
  },

  async getAnalytics(params?: any) {
    return apiRequest('GET', '/api/admin/analytics', null, { params });
  },

  // Content moderation queue
  async getModerationQueue(params: { priority?: string; type?: string } = {}) {
    return apiRequest('GET', '/api/admin/moderation/queue', null, { params });
  },

  // Crisis detection monitoring
  async getCrisisDetection() {
    return apiRequest('GET', '/api/admin/monitoring/crisis-detection');
  },

  // Live sanctuary monitoring
  async getSanctuaryMonitoring() {
    return apiRequest('GET', '/api/admin/monitoring/sanctuary-sessions');
  },

  // Expert performance analytics
  async getExpertPerformance() {
    return apiRequest('GET', '/api/admin/analytics/expert-performance');
  },

  // Real-time expert application monitoring
  async getExpertApplications() {
    return apiRequest('GET', '/api/admin/monitoring/expert-applications');
  }
};

// Post API methods
export const PostApi = {
  async createPost(postData: any) {
    return apiRequest('POST', '/api/posts', postData);
  },

  async getPosts(params?: any) {
    return apiRequest('GET', '/api/posts', null, { params });
  },

  async getPost(id: string) {
    return apiRequest('GET', `/api/posts/${id}`);
  },

  async updatePost(id: string, updates: any) {
    return apiRequest('PUT', `/api/posts/${id}`, updates);
  },

  async deletePost(id: string) {
    return apiRequest('DELETE', `/api/posts/${id}`);
  },

  async likePost(id: string) {
    return apiRequest('POST', `/api/posts/${id}/like`);
  },

  async unlikePost(id: string) {
    return apiRequest('POST', `/api/posts/${id}/unlike`);
  },

  async flagPost(id: string, reason: string) {
    return apiRequest('POST', `/api/posts/${id}/flag`, { reason });
  },

  async addComment(postId: string, content: string) {
    return apiRequest('POST', `/api/posts/${postId}/comment`, { content });
  }
};

// Analytics API methods
export const AnalyticsApi = {
  async getOverview(params?: any) {
    return apiRequest('GET', '/api/analytics/overview', null, { params });
  },

  async getUserMetrics(params?: any) {
    return apiRequest('GET', '/api/analytics/users', null, { params });
  },

  async getExpertMetrics(params?: any) {
    return apiRequest('GET', '/api/analytics/experts', null, { params });
  },

  async getSessionMetrics(params?: any) {
    return apiRequest('GET', '/api/analytics/sessions', null, { params });
  },

  async trackEvent(eventData: any) {
    return apiRequest('POST', '/api/analytics/events', eventData);
  },

  async getExpertAnalytics(expertId: string, timeframe?: string) {
    return apiRequest('GET', '/api/analytics/expert-analytics', null, { 
      params: { expertId, timeframe } 
    });
  },

  async getExpertRankings(sortBy?: string, limit?: number) {
    return apiRequest('GET', '/api/analytics/expert-rankings', null, { 
      params: { sortBy, limit } 
    });
  },

  async getPlatformAnalytics(params?: any) {
    return apiRequest('GET', '/api/analytics/platform', null, { params });
  }
};

// Sanctuary API methods
export const SanctuaryApi = {
  async createSanctuary(sanctuaryData: any) {
    return apiRequest('POST', '/api/sanctuary/sessions', sanctuaryData);
  },

  async createSession(sessionData: any) {
    return apiRequest('POST', '/api/sanctuary/sessions', sessionData);
  },

  async getSanctuaries(params?: any) {
    return apiRequest('GET', '/api/sanctuary/sessions', null, { params });
  },

  async getSession(id: string) {
    return apiRequest('GET', `/api/sanctuary/sessions/${id}`);
  },

  async joinSanctuary(id: string, options?: { alias?: string }) {
    return apiRequest('POST', `/api/sanctuary/sessions/${id}/join`, options);
  },

  async joinSession(sessionId: string, options?: { alias?: string }) {
    return apiRequest('POST', `/api/sanctuary/sessions/${sessionId}/join`, options);
  },

  async leaveSanctuary(id: string) {
    return apiRequest('POST', `/api/sanctuary/sessions/${id}/leave`);
  },

  async endSession(sessionId: string, hostToken?: string) {
    return apiRequest('POST', `/api/sanctuary/sessions/${sessionId}/end`, { hostToken });
  },

  async flagSession(id: string, reason: string) {
    return apiRequest('POST', `/api/sanctuary/sessions/${id}/flag`, { reason });
  },

  async removeParticipant(sessionId: string, participantId: string, hostToken?: string) {
    return apiRequest('POST', `/api/sanctuary/sessions/${sessionId}/remove-participant`, { 
      participantId, 
      hostToken 
    });
  },

  async moderateSession(sessionId: string, action: any) {
    return apiRequest('POST', `/api/sanctuary/sessions/${sessionId}/moderate`, action);
  },

  async submitMessage(sessionId: string, alias: string, message: string) {
    return apiRequest('POST', `/api/sanctuary/sessions/${sessionId}/submit`, { alias, message });
  },

  async getSubmissions(sessionId: string, hostToken?: string) {
    const headers: Record<string, string> = {};
    if (hostToken) {
      headers['x-host-token'] = hostToken;
    }
    return apiRequest('GET', `/api/sanctuary/sessions/${sessionId}/submissions`, null, { 
      headers,
      params: hostToken ? { hostToken } : {}
    });
  }
};

// Live Sanctuary API methods
export const LiveSanctuaryApi = {
  async createSession(sessionData: any) {
    return apiRequest('POST', '/api/live-sanctuary', sessionData);
  },

  async getSession(id: string) {
    return apiRequest('GET', `/api/live-sanctuary/${id}`);
  },

  async joinSession(sessionId: string, options: { alias?: string }) {
    return apiRequest('POST', `/api/live-sanctuary/${sessionId}/join`, options);
  },

  async endSession(sessionId: string, hostToken?: string) {
    return apiRequest('POST', `/api/live-sanctuary/${sessionId}/end`, { hostToken });
  },

  async leaveSession(sessionId: string) {
    return apiRequest('POST', `/api/live-sanctuary/${sessionId}/leave`);
  },

  async removeParticipant(sessionId: string, participantId: string, hostToken?: string) {
    return apiRequest('POST', `/api/live-sanctuary/${sessionId}/remove-participant`, { 
      participantId, 
      hostToken 
    });
  }
};

// Session API methods
export const SessionApi = {
  async createSession(sessionData: any) {
    return apiRequest('POST', '/api/sessions', sessionData);
  },

  async getSessions(params?: any) {
    return apiRequest('GET', '/api/sessions', null, { params });
  },

  async getSession(id: string) {
    return apiRequest('GET', `/api/sessions/${id}`);
  },

  async joinSession(id: string) {
    return apiRequest('POST', `/api/sessions/${id}/join`);
  },

  async endSession(id: string) {
    return apiRequest('POST', `/api/sessions/${id}/end`);
  }
};

// Gemini API methods
export const GeminiApi = {
  async refineContent(content: string, instructions?: string) {
    // Map to backend improve endpoint
    return apiRequest('POST', '/api/gemini/improve', { content, instructions });
  },

  async refinePost(content: string, instructions?: string) {
    return apiRequest('POST', '/api/gemini/refine-post', { content, instructions });
  },

  async generateSuggestions(context: any) {
    return apiRequest('POST', '/api/ai/gemini/suggestions', context);
  },

  async analyzeContent(content: string) {
    return apiRequest('POST', '/api/ai/gemini/analyze', { content });
  }
};

// Enhanced Admin API for flagship admin panel
export const EnhancedAdminApi = {
  async getExpertsAdvanced(params?: any) {
    return apiRequest('GET', '/api/admin/experts/advanced', null, { params });
  },

  async bulkAction(data: { expertIds: string[]; action: string; notes?: string }) {
    return apiRequest('POST', '/api/admin/experts/bulk-action', data);
  },

  async getPlatformOverview(params?: any) {
    return apiRequest('GET', '/api/admin/analytics/platform-overview', null, { params });
  },

  async getApplicationMonitoring() {
    return apiRequest('GET', '/api/admin/monitoring/expert-applications');
  }
};

// Fixed re-export to avoid conflicts

// Export temporary API fixes
export * from './temporaryApiExports';

export default api;