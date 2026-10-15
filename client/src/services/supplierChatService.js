import { api } from './apiService';

const base = '/supplier-chats/conversations';
export const supplierChatService = {
  list: () => api.get(base),
  open: context => api.post(base, context),
  messages: (id, cursor) => api.get(`${base}/${id}/messages`, { params: cursor ? { before: cursor } : {} }),
  send: (id, content, clientMessageId) => api.post(`${base}/${id}/messages`, { content, clientMessageId }),
  read: id => api.patch(`${base}/${id}/read`)
};
