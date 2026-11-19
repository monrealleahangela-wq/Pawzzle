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

  extractDocument: (file, documentType, expectedValues = {}) => {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('documentType', documentType);
    formData.append('expectedValues', JSON.stringify(expectedValues));
    return api.post('/store-applications/ocr/extract', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  saveDraft: (formData) => api.post('/store-applications/draft', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),

  submitExpansionRequest: (formData) => api.post('/store-applications/expansion', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),

  withdrawApplication: () => api.patch('/store-applications/my-application/withdraw'),

  // Get all applications (Super Admin only)
  getAllApplications: (params) => api.get('/store-applications', { params }),

  // Get application by ID (Super Admin only)
  getApplicationById: (id) => api.get(`/store-applications/${id}`),

  // Review application (Super Admin only)
  reviewApplication: (id, reviewData) => api.put(`/store-applications/${id}/review`, reviewData),

  verifyTaxProfile: (id, reviewData) => api.put(`/store-applications/${id}/tax-verification`, reviewData),

  correctDocumentReview: (id, corrections) => api.patch(`/store-applications/${id}/document-review`, { corrections }),

  getDocument: (id, documentType, documentId) => api.get(`/store-applications/${id}/documents/${documentType}${documentId !== undefined ? `/${documentId}` : ''}`, {
    responseType: 'blob'
  }),

  // Get user's application
  getUserApplication: () => api.get('/store-applications/my-application')
};

export default storeApplicationService;
