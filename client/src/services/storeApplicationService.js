import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

const storeApplicationService = {
  // Submit application
  submitApplication: (formData) => {
    const config = {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    };
    return api.post('/store-applications', formData, config);
  },

  // Get all applications (Super Admin only)
  getAllApplications: (params) => api.get('/store-applications', { params }),

  // Get application by ID (Super Admin only)
  getApplicationById: (id) => api.get(`/store-applications/${id}`),

  // Review application (Super Admin only)
  reviewApplication: (id, reviewData) => api.put(`/store-applications/${id}/review`, reviewData),

  // Get user's application
  getUserApplication: () => api.get('/store-applications/my-application')
};

export default storeApplicationService;
