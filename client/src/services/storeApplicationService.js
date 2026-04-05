import api from './apiService';

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
