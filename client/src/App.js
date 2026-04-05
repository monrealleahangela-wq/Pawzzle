// Pawzzle App - Integrated Version: 2026-03-31 09:30 (Root URL + Pet Profiles Patch)
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastContainer, Slide } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './styles/Global.css';

import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import RoleBasedRedirect from './components/RoleBasedRedirect';
import DeliveryTracking from './pages/DeliveryTracking';

// Auth Pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import OAuthCallback from './pages/auth/OAuthCallback';

// Public Pages
import Landing from './pages/public/Landing';

// Customer Pages
import Home from './pages/customer/Home';
import Pets from './pages/customer/Pets';
import Products from './pages/customer/Products';
import PetDetail from './pages/customer/PetDetail';
import ProductDetail from './pages/customer/ProductDetail';
import Services from './pages/customer/Services';
import Cart from './pages/customer/Cart';
import Checkout from './pages/customer/Checkout';
import Orders from './pages/customer/Orders';
import Profile from './pages/customer/Profile';
import AccountUpgrade from './pages/customer/AccountUpgrade';
import StoreApplication from './pages/storeOwner/StoreApplication';
import OrderDetail from './pages/customer/OrderDetail';
import Bookings from './pages/customer/Bookings';
import BookingCalendar from './pages/customer/BookingCalendar';
import StoreDetail from './pages/customer/StoreDetail';
import Stores from './pages/customer/Stores';
import Search from './pages/customer/Search';
import Adoptions from './pages/customer/Adoptions';
import CustomerDSS from './pages/customer/DSS';
import CustomerVouchers from './pages/customer/Vouchers';
import AppealForm from './pages/customer/AppealForm';

// Admin Pages
import AdminDashboard from './pages/admin/Dashboard';
import AdminPets from './pages/admin/Pets';
import ProductInventory from './pages/admin/ProductInventory';
import AdminOrders from './pages/admin/Orders';
import AdminChat from './pages/admin/AdminChat';
import ServiceManagement from './pages/admin/ServiceManagement';
import BookingsManagement from './pages/admin/BookingsManagement';
import AdminSettings from './pages/admin/AdminSettings';
import StoreManagement from './pages/admin/StoreManagement';
import VoucherManagement from './pages/admin/VoucherManagement';
import AdminUsers from './pages/admin/Users';
import ReviewManagement from './pages/admin/ReviewManagement';
import AdminDSS from './pages/admin/DSS';
import AdminPayouts from './pages/admin/Payouts';
import StorePayout from './pages/admin/StorePayout';
import StaffManagement from './pages/admin/StaffManagement';
import Customers from './pages/admin/Customers';

// Super Admin Pages
import SuperAdminDashboard from './pages/superadmin/Dashboard';
import AccountManagement from './pages/superadmin/AccountManagement';
import TransactionHistory from './pages/superadmin/TransactionHistory';
import SystemAnalytics from './pages/superadmin/SystemAnalytics';
import BookingHistory from './pages/superadmin/BookingHistory';
import ArchiveManagement from './pages/superadmin/ArchiveManagement';
import ReportManagement from './pages/superadmin/ReportManagement';
import FeedbackManagement from './pages/superadmin/FeedbackManagement';
import StoreApplications from './pages/admin/StoreApplications';
import SuperAdminDSS from './pages/superadmin/DSS';
import ActivityHistory from './pages/superadmin/ActivityHistory';
import SupportManagement from './pages/superadmin/SupportManagement';
import RolePermissions from './pages/superadmin/RolePermissions';

// Not Found
import NotFound from './pages/NotFound';

// Add future flags for React Router v7 compatibility
const routerConfig = {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true
  }
};

const BrandedToastIcon = () => (
  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-primary-100 overflow-hidden">
    <img 
      src="/images/logo.png" 
      alt="Pawzzle" 
      className="w-6 h-6 object-contain"
      onError={(e) => {
        e.target.onerror = null;
        e.target.src = 'https://raw.githubusercontent.com/lucide-react/lucide/main/icons/paw-print.svg';
      }}
    />
  </div>
);

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <CartProvider>
          <Router {...routerConfig}>
            <div className="App">
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/oauth-callback" element={<OAuthCallback />} />
                <Route path="/rider-track/:token" element={<DeliveryTracking isRider={true} />} />
                <Route path="/track/:token" element={<DeliveryTracking isRider={false} />} />

                {/* Protected Routes with Layout */}
                <Route path="/" element={<Layout />}>
                  <Route index element={<RoleBasedRedirect />} />
                  <Route path="home" element={<Home />} />
                  <Route path="pets" element={<Pets />} />
                  <Route path="pets/:id" element={<PetDetail />} />
                  <Route path="products" element={<Products />} />
                  <Route path="products/:id" element={<ProductDetail />} />
                  <Route path="services" element={<Services />} />
                  <Route path="stores" element={<Stores />} />
                  <Route path="stores/:storeId" element={<StoreDetail />} />
                  <Route path="search" element={<Search />} />
                  <Route path="profile" element={<ProtectedRoute roles={['customer', 'admin', 'super_admin']}><Profile /></ProtectedRoute>} />
                  <Route path="cart" element={<ProtectedRoute roles={['customer', 'admin', 'super_admin']}><Cart /></ProtectedRoute>} />
                  <Route path="checkout" element={<ProtectedRoute roles={['customer', 'admin', 'super_admin']}><Checkout /></ProtectedRoute>} />
                  <Route path="orders" element={<ProtectedRoute roles={['customer', 'admin', 'super_admin']}><Orders /></ProtectedRoute>} />
                  <Route path="orders/:id" element={<ProtectedRoute roles={['customer', 'admin', 'super_admin']}><OrderDetail /></ProtectedRoute>} />
                  <Route path="bookings" element={<ProtectedRoute roles={['customer', 'admin', 'super_admin']}><Bookings /></ProtectedRoute>} />
                  <Route path="booking-calendar" element={<ProtectedRoute roles={['customer', 'admin', 'super_admin']}><BookingCalendar /></ProtectedRoute>} />
                  <Route path="account-upgrade" element={<ProtectedRoute roles={['customer', 'admin', 'super_admin']}><StoreApplication /></ProtectedRoute>} />
                  <Route path="insights" element={<ProtectedRoute roles={['customer', 'admin', 'super_admin']}><CustomerDSS /></ProtectedRoute>} />
                  <Route path="vouchers" element={<ProtectedRoute roles={['customer', 'admin', 'super_admin']}><CustomerVouchers /></ProtectedRoute>} />
                  <Route path="appeal/:reportId" element={<ProtectedRoute roles={['customer', 'admin', 'super_admin']}><AppealForm /></ProtectedRoute>} />

                  {/* Admin Routes */}
                  {/* Dashboard - all staff types can see */}
                  <Route path="admin/dashboard" element={<ProtectedRoute roles={['admin', 'super_admin', 'staff']}><AdminDashboard /></ProtectedRoute>} />

                  {/* Catalog - inventory_staff only */}
                  <Route path="admin/pets" element={<ProtectedRoute roles={['admin', 'super_admin', 'staff']} staffTypes={['inventory_staff']}><AdminPets /></ProtectedRoute>} />
                  <Route path="admin/products" element={<ProtectedRoute roles={['admin', 'super_admin', 'staff']} staffTypes={['inventory_staff']}><ProductInventory /></ProtectedRoute>} />
                  <Route path="admin/inventory" element={<ProtectedRoute roles={['admin', 'super_admin', 'staff']} staffTypes={['inventory_staff']}><ProductInventory /></ProtectedRoute>} />

                  {/* Orders - order_staff and delivery_staff */}
                  <Route path="admin/orders" element={<ProtectedRoute roles={['admin', 'super_admin', 'staff']} staffTypes={['order_staff', 'delivery_staff']}><AdminOrders /></ProtectedRoute>} />
                  <Route path="admin/orders/:id" element={<ProtectedRoute roles={['admin', 'super_admin', 'staff']} staffTypes={['order_staff', 'delivery_staff']}><OrderDetail /></ProtectedRoute>} />

                  {/* Bookings - order_staff and service_staff */}
                  <Route path="admin/bookings" element={<ProtectedRoute roles={['admin', 'super_admin', 'staff']} staffTypes={['order_staff', 'service_staff']}><BookingsManagement /></ProtectedRoute>} />

                  {/* Services - service_staff only */}
                  <Route path="admin/services" element={<ProtectedRoute roles={['admin', 'super_admin', 'staff']} staffTypes={['service_staff']}><ServiceManagement /></ProtectedRoute>} />

                  {/* Customers - order_staff and delivery_staff */}
                  <Route path="admin/customers" element={<ProtectedRoute roles={['admin', 'super_admin', 'staff']} staffTypes={['order_staff', 'delivery_staff']}><Customers /></ProtectedRoute>} />

                  {/* Admin-only routes (no staff access) */}
                  <Route path="admin/chat" element={<ProtectedRoute roles={['admin', 'super_admin']}><AdminChat /></ProtectedRoute>} />
                  <Route path="admin/store" element={<ProtectedRoute roles={['admin', 'super_admin']}><StoreManagement /></ProtectedRoute>} />
                  <Route path="admin/vouchers" element={<ProtectedRoute roles={['admin', 'super_admin']}><VoucherManagement /></ProtectedRoute>} />
                  <Route path="admin/users" element={<ProtectedRoute roles={['super_admin']}><AdminUsers /></ProtectedRoute>} />
                  <Route path="admin/reviews" element={<ProtectedRoute roles={['admin', 'super_admin']}><ReviewManagement /></ProtectedRoute>} />
                  <Route path="admin/settings" element={<ProtectedRoute roles={['admin', 'super_admin']}><AdminSettings /></ProtectedRoute>} />
                  <Route path="admin/insights" element={<ProtectedRoute roles={['admin', 'super_admin', 'staff']}><AdminDSS /></ProtectedRoute>} />
                  <Route path="admin/payouts" element={<ProtectedRoute roles={['admin', 'super_admin']}><StorePayout /></ProtectedRoute>} />
                  <Route path="admin/staff" element={<ProtectedRoute roles={['admin', 'super_admin']}><StaffManagement /></ProtectedRoute>} />
                  <Route path="superadmin/payouts" element={<ProtectedRoute roles={['super_admin']}><AdminPayouts /></ProtectedRoute>} />

                  {/* Super Admin Routes */}
                  <Route path="superadmin/dashboard" element={<ProtectedRoute roles={['super_admin']}><SuperAdminDashboard /></ProtectedRoute>} />
                  <Route path="superadmin/permissions" element={<ProtectedRoute roles={['super_admin']}><RolePermissions /></ProtectedRoute>} />
                  <Route path="superadmin/account-management" element={<ProtectedRoute roles={['super_admin']}><AccountManagement /></ProtectedRoute>} />
                  <Route path="superadmin/store-applications" element={<ProtectedRoute roles={['super_admin']}><StoreApplications /></ProtectedRoute>} />
                  <Route path="superadmin/transaction-history" element={<ProtectedRoute roles={['super_admin']}><TransactionHistory /></ProtectedRoute>} />
                  <Route path="superadmin/system-analytics" element={<ProtectedRoute roles={['super_admin']}><SystemAnalytics /></ProtectedRoute>} />
                  <Route path="superadmin/booking-history" element={<ProtectedRoute roles={['super_admin']}><BookingHistory /></ProtectedRoute>} />
                  <Route path="superadmin/archive" element={<ProtectedRoute roles={['super_admin']}><ArchiveManagement /></ProtectedRoute>} />
                  <Route path="superadmin/reports" element={<ProtectedRoute roles={['super_admin']}><ReportManagement /></ProtectedRoute>} />
                  <Route path="superadmin/feedback" element={<ProtectedRoute roles={['super_admin']}><FeedbackManagement /></ProtectedRoute>} />
                  <Route path="superadmin/support" element={<ProtectedRoute roles={['super_admin']}><SupportManagement /></ProtectedRoute>} />
                  <Route path="superadmin/insights" element={<ProtectedRoute roles={['super_admin']}><SuperAdminDSS /></ProtectedRoute>} />
                  <Route path="superadmin/activity-history" element={<ProtectedRoute roles={['super_admin']}><ActivityHistory /></ProtectedRoute>} />
                </Route>

                {/* 404 Route */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              <ToastContainer 
                position="top-right" 
                autoClose={3000} 
                transition={Slide} 
                icon={BrandedToastIcon}
                toastClassName="!rounded-2xl !p-4 !shadow-strong !border-none"
                bodyClassName="!font-bold !text-[12px] !uppercase !tracking-widest !text-primary-900"
              />
            </div>
          </Router>
        </CartProvider>
      </NotificationProvider>
    </AuthProvider >
  );
}

export default App;
