import { api } from './apiService';

export const returnService = {
  forOrder: orderId => api.get(`/returns/order/${orderId}`),
  request: (orderId, itemId, reason) => api.post(`/returns/order/${orderId}`, { itemId, reason }),
  transition: (id, action, note, riderId) => api.post(`/returns/${id}/transition`, { action, note, riderId }),
  riders: orderId => api.get(`/returns/order/${orderId}/riders`),
  mine: () => api.get('/returns/mine'),
  store: () => api.get('/returns/store'),
  uploadEvidence: (id, file) => {
    const body = new FormData();
    body.append('image', file);
    return api.post(`/returns/${id}/evidence`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  evidenceAccess: (id, evidenceId) => api.get(`/returns/${id}/evidence/${evidenceId}/access`)
};
