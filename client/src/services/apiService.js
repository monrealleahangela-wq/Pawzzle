import axios from 'axios';

// Utility for image URLs
export const getImageUrl = (path) => {
  if (!path || typeof path !== 'string') return null;
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  const baseUrl = (process.env.REACT_APP_API_URL || `${window.location.origin}/api`).replace('/api', '');
  return `${baseUrl}/${path.startsWith('/') ? path.slice(1) : path}`;
};

// The "Golden Solution": Automatically use the current domain for API requests
const API_BASE_URL = process.env.REACT_APP_API_URL || `${window.location.origin}/api`;

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
    // Debug: Log the actual URL being called
    console.log('🌐 API Request:', config.method?.toUpperCase(), config.baseURL + config.url);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Debounce to prevent multiple simultaneous 401s from triggering multiple logouts
let isHandling401 = false;

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // ONLY clear session and redirect if:
      // 1. The token truly doesn't exist (not a transient error)
      // 2. We're not already handling a 401 (debounce)
      // 3. We're not on a public page already
      const token = localStorage.getItem('token');
      const publicPaths = ['/login', '/register', '/oauth-callback'];
      const isPublicPath = publicPaths.some(p => window.location.pathname.startsWith(p));
      const isOnRoot = window.location.pathname === '/';

      if (!token && !isPublicPath && !isOnRoot && !isHandling401) {
        isHandling401 = true;
        setTimeout(() => { isHandling401 = false; }, 3000);
        window.location.href = '/';
      }
      // If token exists, do NOT clear it - this may be a transient 401
      // just let the error propagate naturally
    }
    
    // Handle Account Disabled (403)
    if (error.response?.status === 403 && error.response?.data?.isDisabled) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Store deactivation info temporarily for the Login page
      sessionStorage.setItem('deactivationinfo', JSON.stringify({
        reason: error.response.data.deactivationReason,
        contact: error.response.data.contactSupport
      }));
      
      if (window.location.pathname !== '/login') {
        window.location.href = '/';
      }
    }

    return Promise.reject(error);
  }
);

// Pet services
export const petService = {
  getAllPets: (params) => api.get('/pets', { params }),
  getPetById: (id) => api.get(`/pets/${id}`),
  createPet: (petData) => api.post('/pets', petData),
  updatePet: (id, petData) => api.put(`/pets/${id}`, petData),
  deletePet: (id) => api.delete(`/pets/${id}`)
};

// Admin pet services (filtered by user's store)
export const adminPetService = {
  getAllPets: (params) => api.get('/admin/pets', { params }),
  getPetById: (id) => api.get(`/admin/pets/${id}`),
  createPet: (petData) => api.post('/admin/pets', petData),
  updatePet: (id, petData) => api.put(`/admin/pets/${id}`, petData),
  deletePet: (id) => api.delete(`/admin/pets/${id}`)
};

// Product services
export const productService = {
  getAllProducts: (params) => api.get('/products', { params }),
  getProductById: (id) => api.get(`/products/${id}`),
  createProduct: (productData) => api.post('/products', productData),
  updateProduct: (id, productData) => api.put(`/products/${id}`, productData),
  deleteProduct: (id) => api.delete(`/products/${id}`),
  updateStock: (id, stockData) => api.patch(`/products/${id}/stock`, stockData)
};

// Admin product services (filtered by user's store)
export const adminProductService = {
  getAllProducts: (params) => api.get('/admin/products', { params }),
  getProductById: (id) => api.get(`/admin/products/${id}`),
  createProduct: (productData) => api.post('/admin/products', productData),
  updateProduct: (id, productData) => api.put(`/admin/products/${id}`, productData),
  deleteProduct: (id) => api.delete(`/admin/products/${id}`),
  updateStock: (id, stockData) => api.patch(`/admin/products/${id}/stock`, stockData)
};

// Order services
export const orderService = {
  getAllOrders: (params) => api.get('/orders', { params }),
  getOrderById: (id) => api.get(`/orders/${id}`),
  createOrder: (orderData) => api.post('/orders', orderData),
  updateOrderStatus: (id, statusData) => api.patch(`/orders/${id}/status`, statusData),
  cancelOrder: (id) => api.patch(`/orders/${id}/cancel`)
};

// Admin order services (filtered by user's store)
export const adminOrderService = {
  getAllOrders: (params) => api.get('/admin/orders', { params }),
  getOrderById: (id) => api.get(`/admin/orders/${id}`),
  updateOrderStatus: (id, statusData) => api.patch(`/admin/orders/${id}/status`, statusData),
  confirmPayment: (id) => api.patch(`/admin/orders/${id}/confirm-payment`),
  cancelOrder: (id) => api.patch(`/admin/orders/${id}/cancel`)
};

// Payout services
export const payoutService = {
  // Store owner
  getStats: () => api.get('/payouts/stats'),
  getHistory: () => api.get('/payouts/history'),
  request: (data) => api.post('/payouts/request', data),
  updateMethods: (payoutMethods) => api.put('/payouts/methods', { payoutMethods }),
  // Admin
  adminGetAll: (params) => api.get('/payouts/admin/all', { params }),
  adminProcess: (id, data) => api.patch(`/payouts/admin/${id}/process`, data)
};
// Staff management services (Admin only)
export const staffService = {
  getAll: () => api.get('/staff'),
  create: (data) => api.post('/staff', data),
  update: (id, data) => api.put(`/staff/${id}`, data),
  toggleStatus: (id) => api.patch(`/staff/${id}/toggle-status`),
  resetPassword: (id, newPassword) => api.patch(`/staff/${id}/reset-password`, { newPassword }),
  remove: (id) => api.delete(`/staff/${id}`)
};

// Customer services (Admin only)
export const customerService = {
  getStoreCustomers: () => api.get('/customers'),
  getCustomerDetails: (customerId) => api.get(`/customers/${customerId}`)
};

// Admin booking services (filtered by user's store)
export const adminBookingService = {
  getAllBookings: (params) => api.get('/admin/bookings', { params }),
  getBookingById: (id) => api.get(`/admin/bookings/${id}`),
  updateBookingStatus: (bookingId, status) => api.put(`/admin/bookings/${bookingId}/status`, { status }),
  updatePaymentMethod: (bookingId, paymentMethod) => api.put(`/admin/bookings/${bookingId}/payment-method`, { paymentMethod }),
  confirmPayment: (bookingId) => api.put(`/admin/bookings/${bookingId}/confirm-payment`),
  cancelBooking: (bookingId) => api.put(`/admin/bookings/${bookingId}/cancel`)
};

// Admin voucher services (filtered by user's store)
export const adminVoucherService = {
  getAllVouchers: (params) => api.get('/admin/vouchers', { params }),
  createVoucher: (voucherData) => api.post('/admin/vouchers', voucherData),
  updateVoucher: (id, voucherData) => api.put(`/admin/vouchers/${id}`, voucherData),
  deleteVoucher: (id) => api.delete(`/admin/vouchers/${id}`),
  toggleVoucherStatus: (id) => api.patch(`/admin/vouchers/${id}/status`)
};

// Admin report services
export const adminReportService = {
  createReport: (data) => api.post('/reports', data),
  getAllReports: (params) => api.get('/reports/all', { params }),
  getReportById: (reportId) => api.get(`/reports/${reportId}`),
  submitAppeal: (reportId, data) => api.post(`/reports/appeal/${reportId}`, data),
  updateReportStatus: (reportId, data) => api.patch(`/reports/${reportId}`, data),
  getImageUrl: (path) => getImageUrl(path)
};

// User services
export const userService = {
  getAllUsers: (params) => api.get('/users', { params }),
  getUserById: (id) => api.get(`/users/${id}`),
  updateUser: (id, userData) => api.put(`/users/${id}`, userData),
  createUser: (userData) => api.post('/users', userData),
  deleteUser: (id) => api.delete(`/users/${id}`),
  getUserCredentials: (id) => api.get(`/users/${id}/credentials`),
  toggleUserStatus: (id, data) => api.patch(`/users/${id}/toggle-status`, data),
  getAdminSettings: () => api.get('/users/admin/settings'),
  updateAdminSettings: (settings) => api.put('/users/admin/settings', settings),
  getActivityLogs: () => api.get('/users/activity-logs')
};

// Service services
export const serviceService = {
  getAllServices: (params) => api.get('/services/all', { params }),
  getServiceById: (id) => api.get(`/services/${id}`),
  getStoreServices: (storeId, params) => api.get(`/services/store/${storeId}`, { params }),
  createService: (storeId, serviceData) => api.post(`/services/store/${storeId}`, serviceData),
  createAdminService: (serviceData) => api.post('/services/admin', serviceData), // Admin endpoint without store requirement
  updateService: (id, serviceData) => api.put(`/services/${id}`, serviceData),
  deleteService: (id) => api.delete(`/services/${id}`)
};

// Admin service services (filtered by user's store)
export const adminServiceService = {
  getAllServices: (params) => api.get('/admin/services', { params }),
  getServiceById: (id) => api.get(`/admin/services/${id}`),
  createService: (serviceData) => api.post('/admin/services', serviceData),
  updateService: (id, serviceData) => api.put(`/admin/services/${id}`, serviceData),
  deleteService: (id) => api.delete(`/admin/services/${id}`)
};

// Booking services
export const bookingService = {
  createBooking: (bookingData) => api.post('/bookings', bookingData),
  getCustomerBookings: (params) => api.get('/bookings/my-bookings', { params }),
  getStoreBookings: (storeId, params) => api.get(`/bookings/store/${storeId}`, { params }),
  getAllBookings: (params) => api.get('/bookings/all', { params }),
  getCalendarBookings: (params) => api.get('/bookings/calendar', { params }),
  updateBookingStatus: (bookingId, status) => api.put(`/bookings/${bookingId}/status`, { status }),
  updatePaymentMethod: (bookingId, paymentMethod) => api.put(`/bookings/${bookingId}/payment-method`, { paymentMethod }),
  cancelBooking: (bookingId) => api.put(`/bookings/${bookingId}/cancel`)
};

// Cart services
export const cartService = {
  getCart: () => api.get('/cart'),
  syncCart: (items) => api.post('/cart/sync', { items }),
  addToCart: (itemData) => api.post('/cart/add', itemData),
  updateQuantity: (itemId, itemType, quantity) => api.put('/cart/quantity', { itemId, itemType, quantity }),
  toggleSelection: (itemId, itemType) => api.put('/cart/toggle', { itemId, itemType }),
  removeFromCart: (itemId, itemType) => api.delete(`/cart/remove/${itemType}/${itemId}`),
  clearCart: () => api.delete('/cart/clear')
};

// Upload services
export const uploadService = {
  uploadImage: (formData) => api.post('/uploads/single', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  }),
  uploadMultipleImages: (formData) => api.post('/uploads/multiple', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  }),
  deleteImage: (filename) => api.delete(`/uploads/${filename}`)
};

// Inventory services
export const inventoryService = {
  // Store-specific (for super_admin or existing store-assigned usage)
  getStoreInventory: (storeId, params) => api.get(`/inventory/store/${storeId}`, { params }),
  addToInventory: (storeId, data) => api.post(`/inventory/store/${storeId}`, data),
  getLowStockAlerts: (storeId) => api.get(`/inventory/store/${storeId}/alerts`),
  // Admin-specific: admin IS the store — no storeId param needed
  adminGetInventory: (params) => api.get('/inventory/admin', { params }),
  adminGetAlerts: () => api.get('/inventory/admin/alerts'),
  adminAddToInventory: (data) => api.post('/inventory/admin', data),
  // Item-level actions
  updateQuantity: (id, data) => api.put(`/inventory/${id}`, data),
  deleteInventoryItem: (id) => api.delete(`/inventory/${id}`)
};

// Store services
export const storeService = {
  getAllStores: (params) => api.get('/stores', { params }),
  getStoreById: (id) => api.get(`/stores/${id}`),
  getStoreDetails: (id) => api.get(`/stores/${id}/details`),
  getMyStore: () => api.get('/stores/my-store'),
  createStore: (storeData) => api.post('/stores', storeData),
  updateStore: (id, storeData) => api.put('/stores/my-store', storeData),
  deleteStore: (id) => api.delete(`/stores/${id}`),
  getSettings: () => api.get('/store/settings'),
  updateSettings: (settings) => api.put('/store/settings', settings),
  getStoreByOwner: (ownerId) => api.get(`/stores/owner/${ownerId}`)
};

// Adoption services
export const adoptionService = {
  requestAdoption: (data) => api.post('/adoption/request', data),
  updateAdoptionStatus: (requestId, data) => api.patch(`/adoption/status/${requestId}`, data),
  cancelAdoptionRequest: (requestId) => api.patch(`/adoption/cancel/${requestId}`),
  getMyRequests: () => api.get('/adoption/my-requests'),
  getAdoptionByConversation: (conversationId) => api.get(`/adoption/conversation/${conversationId}`)
};

// Payment services
export const paymentService = {
  createCheckoutSession: (orderId) => api.post(`/payment/create-checkout-session/${orderId}`),
  verifyPayment: (orderId) => api.get(`/payment/verify/${orderId}`)
};

// Voucher services (Customer)
export const voucherService = {
  getAvailableVouchers: (params) => api.get('/vouchers/available', { params }),
  claimVoucher: (voucherId) => api.post('/vouchers/claim', { voucherId }),
  getMyVouchers: () => api.get('/vouchers/my-vouchers'),
  verifyVoucher: (data) => api.post('/vouchers/verify', data)
};

// Review & Feedback services
export const reviewService = {
  createReview: (reviewData) => api.post('/reviews', reviewData),
  getTargetReviews: (targetType, targetId, params) => api.get(`/reviews/${targetType}/${targetId}`, { params }),
  createPlatformFeedback: (data) => api.post('/reviews/platform', data),
  getAllPlatformFeedback: (params) => api.get('/reviews/platform/all', { params }),
  updatePlatformFeedbackStatus: (id, data) => api.patch(`/reviews/platform/${id}`, data),
  deletePlatformFeedback: (id) => api.delete(`/reviews/platform/${id}`),
  getShopReviews: (params) => api.get('/reviews/shop', { params }),
  replyToReview: (reviewId, data) => api.post(`/reviews/${reviewId}/reply`, data),
  toggleReviewStatus: (reviewId) => api.patch(`/reviews/${reviewId}/status`),
  checkReviewEligibility: (targetType, targetId) => api.get(`/reviews/eligibility/${targetType}/${targetId}`)
};


// Archive services (Super Admin)
export const archiveService = {
  getArchivedItems: (params) => api.get('/archive', { params }),
  restoreItem: (type, id) => api.patch(`/archive/${type}/${id}/restore`),
  permanentDelete: (type, id) => api.delete(`/archive/${type}/${id}`)
};

// DSS (Decision Support System) services
export const dssService = {
  getCustomerInsights: () => api.get('/dss/customer'),
  getStaffInsights: () => api.get('/dss/staff'),
  getAdminInsights: () => api.get('/dss/admin'),
  getSuperAdminInsights: () => api.get('/dss/superadmin')
};

// Support services
export const supportService = {
  sendGuestMessage: (data) => api.post('/support/guest', data),
  getAllMessages: (params) => api.get('/support/all', { params }),
  updateMessageStatus: (id, data) => api.patch(`/support/${id}`, data)
};


// Social & Favorites services
export const socialService = {
  followUser: (followingId) => api.post('/social/follow', { followingId }),
  unfollowUser: (followingId) => api.delete(`/social/follow/${followingId}`),
  getFollowers: (userId) => api.get(`/social/followers/${userId}`),
  getFollowing: (userId) => api.get(`/social/following/${userId}`),
  toggleFavorite: (productId) => api.post('/social/favorites/toggle', { productId }),
  getUserFavorites: (userId) => api.get(`/social/favorites/${userId}`),
  checkFavoriteStatus: (productId) => api.get(`/social/favorites/check/${productId}`),
  checkFollowStatus: (followingId) => api.get(`/social/follow/check/${followingId}`)
};

// Pet Profile service
export const petProfileService = {
  getMyPets: () => api.get('/pet-profiles'),
  createPet: (data) => api.post('/pet-profiles', data),
  updatePet: (id, data) => api.put(`/pet-profiles/${id}`, data),
  deletePet: (id) => api.delete(`/pet-profiles/${id}`)
};

// Delivery services
export const deliveryService = {
  generateLinks: (orderId) => api.post('/deliveries/generate', { orderId }),
  getTracking: (token) => api.get(`/deliveries/track/${token}`),
  updateStatus: (token, status) => api.patch(`/deliveries/status/${token}`, { status }),
  updateLocation: (token, locationData) => api.patch(`/deliveries/location/${token}`, locationData),
  sendMessage: (token, messageData) => api.post(`/deliveries/chat/${token}`, messageData)
};

export default api;
