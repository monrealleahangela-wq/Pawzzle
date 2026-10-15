import { api } from './apiService';

const petInquiryService = {
  list: params => api.get('/pet-inquiries', { params }),
  get: id => api.get(`/pet-inquiries/${id}`),
  create: data => api.post('/pet-inquiries', data),
  act: (id, data) => api.post(`/pet-inquiries/${id}/actions`, data)
};

export default petInquiryService;
