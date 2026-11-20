import api from './apiService';

export const STORE_APPLICATION_UPLOAD_TIMEOUT_MS = 120000;
export const STORE_DOCUMENT_OCR_TIMEOUT_MS = 120000;

const multipartUploadConfig = {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: STORE_APPLICATION_UPLOAD_TIMEOUT_MS
};

const storeApplicationService = {
  // Submit application
  submitApplication: (formData) => api.post('/store-applications', formData, multipartUploadConfig),

  extractDocument: (file, documentType, expectedValues = {}) => {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('documentType', documentType);
    formData.append('expectedValues', JSON.stringify(expectedValues));
    return api.post('/store-applications/ocr/extract', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: STORE_DOCUMENT_OCR_TIMEOUT_MS
    });
  },

  saveDraft: (formData) => api.post('/store-applications/draft', formData, multipartUploadConfig),

  submitExpansionRequest: (formData) => api.post('/store-applications/expansion', formData, multipartUploadConfig),

  withdrawApplication: () => api.patch('/store-applications/my-application/withdraw'),

  searchStoreLocations: (query) => api.get('/store-applications/location/search', { params: { q: query } }),

  reverseStoreLocation: (lat, lng) => api.get('/store-applications/location/reverse', { params: { lat, lng } }),

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
