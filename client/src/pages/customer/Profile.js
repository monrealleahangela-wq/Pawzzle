import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import { userService, orderService, bookingService, uploadService, adminOrderService, adminBookingService, dssService, adoptionService, getImageUrl } from '../../services/apiService';
import ImageUpload from '../../components/ImageUpload';
import {
  User,
  Camera,
  Edit2,
  Save,
  X,
  Upload,
  Building,
  Store,
  ShoppingCart,
  TrendingUp,
  FileText,
  Check,
  AlertCircle,
  Clock,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Package,
  Shield,
  CreditCard,
  Settings,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  Zap
} from 'lucide-react';
import { getCitiesByProvince, getBarangaysByCity } from '../../constants/locationConstants';
import storeApplicationService from '../../services/storeApplicationService';
import authService from '../../services/authService';
import PlatformFeedbackModal from '../../components/PlatformFeedbackModal';
import { Heart as HeartIcon, MessageSquare, Briefcase, Globe, ShieldCheck, Users } from 'lucide-react';

const Profile = () => {
  const { user, updateUser, logout } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showUpgradeForm, setShowUpgradeForm] = useState(false);
  const [application, setApplication] = useState(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: {
      street: '',
      city: '',
      province: 'cavite', // Automatically set to Cavite
      barangay: '',
      zipCode: '',
      country: 'PH' // Automatically set to Philippines
    }
  });
  const [profilePicture, setProfilePicture] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [upgradeFormData, setUpgradeFormData] = useState({
    businessName: '',
    businessType: '',
    legalStructure: 'single_proprietorship',
    yearsInBusiness: 0,
    numberOfEmployees: 1,
    hasPhysicalStore: true,
    businessLicense: {
      number: '',
      issuingAuthority: 'DTI',
      issueDate: '',
      expiryDate: ''
    },
    taxId: '',
    contactInfo: {
      phone: '',
      email: '',
      address: {
        street: '',
        city: '',
        province: 'cavite',
        zipCode: '',
        country: 'PH'
      }
    },
    paymentInfo: {
      bankName: '',
      bankAccountName: '',
      bankAccountNumber: '',
      alternativePaymentMethod: {
        provider: 'GCash',
        accountNumber: ''
      }
    },
    businessDescription: '',
    references: [
      { name: '', business: '', phone: '', email: '' },
      { name: '', business: '', phone: '', email: '' }
    ],
    insurance: {
      provider: '',
      policyNumber: '',
      coverageAmount: 0,
      expiryDate: ''
    }
  });
  const [files, setFiles] = useState({
    licenseDocument: null,
    insuranceDocument: null,
    governmentId: null,
    businessRegistration: null,
    birRegistration: null,
    mayorsPermit: null,
    barangayClearance: null,
    storeLogo: null,
    certifications: []
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [orders, setOrders] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [adoptions, setAdoptions] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    totalBookings: 0,
    totalPets: 0,
    totalAdoptions: 0
  });
  const [toggling2FA, setToggling2FA] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [showActivityModal, setShowActivityModal] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone || '',
        address: {
          street: user.address?.street || '',
          city: user.address?.city || '',
          province: user.address?.province || 'cavite',
          barangay: user.address?.barangay || '',
          zipCode: user.address?.zipCode || '',
          country: user.address?.country || 'PH'
        }
      });

      setProfilePicture(user.avatar || user.profilePicture || null);
      setPreviewImage(user.avatar || user.profilePicture || null);

      // Fetch user's store application status
      fetchApplicationStatus();

      // Fetch activity data for all roles
      fetchActivityData();
    }
  }, [user]);

  const fetchActivityData = async () => {
    if (!user) return;
    setOrdersLoading(true);

    try {
      if (user.role === 'customer') {
        const [ordersRes, bookingsRes, adoptionsRes, logsRes] = await Promise.all([
          orderService.getAllOrders({ limit: 5 }),
          bookingService.getCustomerBookings({ limit: 5 }),
          adoptionService.getMyRequests().catch(() => ({ data: { requests: [] } })),
          userService.getActivityLogs().catch(() => ({ data: { logs: [] } }))
        ]);
        setOrders(ordersRes.data?.orders || []);
        setBookings(bookingsRes.data?.bookings || []);
        setAdoptions(adoptionsRes.data?.requests || []);
        try { setActivityLogs(typeof logsRes !== 'undefined' ? (logsRes?.data?.logs || []) : []); } catch(e){}
        setActivityLogs(logsRes?.data?.logs || []);

        // Populate stats from pagination totals
        setStats({
          totalOrders: ordersRes.data?.pagination?.totalOrders || 0,
          totalBookings: bookingsRes.data?.pagination?.totalBookings || 0,
          totalAdoptions: adoptionsRes.data?.requests?.length || 0,
          totalRevenue: 0,
          totalPets: 0
        });
      } else if (user.role === 'admin') {
        // Fetch Admin-specific data with multi-tenant isolation
        const [ordersRes, bookingsRes, adoptionsRes, dssRes, logsRes] = await Promise.all([
          adminOrderService.getAllOrders({ limit: 5 }),
          adminBookingService.getAllBookings({ limit: 5 }),
          adoptionService.getMyRequests().catch(() => ({ data: { requests: [] } })),
          dssService.getAdminInsights().catch(() => ({ data: {} })),
          userService.getActivityLogs().catch(() => ({ data: { logs: [] } }))
        ]);
        setOrders(ordersRes.data?.orders || []);
        setBookings(bookingsRes.data?.bookings || []);
        setAdoptions(adoptionsRes.data?.requests || []);
        try { setActivityLogs(typeof logsRes !== 'undefined' ? (logsRes?.data?.logs || []) : []); } catch(e){}
        setActivityLogs(logsRes?.data?.logs || []);

        // Use live stats from DSS instead of stale store object
        if (dssRes.data?.overview) {
          setStats({
            totalOrders: dssRes.data.overview.totalOrders || ordersRes.data?.pagination?.totalOrders || 0,
            totalRevenue: dssRes.data.overview.totalRevenue || 0,
            totalBookings: dssRes.data.overview.totalBookings || bookingsRes.data?.pagination?.totalBookings || 0,
            totalPets: dssRes.data.overview.totalPets || 0,
            totalAdoptions: adoptionsRes.data?.requests?.length || 0
          });
        } else {
          // Fallback stats if DSS fails
          setStats(prev => ({
            ...prev,
            totalOrders: ordersRes.data?.pagination?.totalOrders || 0,
            totalBookings: bookingsRes.data?.pagination?.totalBookings || 0,
            totalAdoptions: adoptionsRes.data?.requests?.length || 0
          }));
        }
      } else if (user.role === 'super_admin') {
        // Super admins see global activity
        const [ordersRes, bookingsRes, adoptionsRes, logsRes] = await Promise.all([
          orderService.getAllOrders({ limit: 5 }),
          bookingService.getAllBookings({ limit: 5 }),
          adoptionService.getMyRequests().catch(() => ({ data: { requests: [] } })),
          userService.getActivityLogs().catch(() => ({ data: { logs: [] } }))
        ]);
        setOrders(ordersRes.data?.orders || []);
        setBookings(bookingsRes.data?.bookings || []);
        setAdoptions(adoptionsRes.data?.requests || []);
        try { setActivityLogs(typeof logsRes !== 'undefined' ? (logsRes?.data?.logs || []) : []); } catch(e){}
        setActivityLogs(logsRes?.data?.logs || []);
      }
    } catch (error) {
      console.error('Error fetching activity data:', error);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Initialize cities for Cavite and handle city/barangay changes
  useEffect(() => {
    // Always load Cavite cities
    setCities(getCitiesByProvince('cavite'));

    // Load barangays if city is selected
    if (formData.address.city) {
      setBarangays(getBarangaysByCity(formData.address.city));
    }
  }, [formData.address.city]);

  const fetchApplicationStatus = async () => {
    try {
      const data = await storeApplicationService.getUserApplication();
      if (data.application) {
        setApplication(data.application);
      }
    } catch (error) {
      console.error('Error fetching application status:', error);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    // Auto-populate form with current user data when editing
    if (user) {
      setFormData({
        username: user.username || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone || '',
        address: {
          street: user.address?.street || '',
          city: user.address?.city || '',
          province: user.address?.province || '',
          barangay: user.address?.barangay || '',
          zipCode: user.address?.zipCode || '',
          country: user.address?.country || 'PH'
        }
      });
    }
    setPreviewImage(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset form to original user data
    if (user) {
      setFormData({
        username: user.username || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone || '',
        address: {
          street: user.address?.street || '',
          city: user.address?.city || '',
          province: user.address?.province || '',
          barangay: user.address?.barangay || '',
          zipCode: user.address?.zipCode || '',
          country: user.address?.country || 'PH'
        }
      });
    }
    setPreviewImage(null);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAddressChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      address: {
        ...prev.address,
        [field]: value,
        // Reset barangay when city changes
        ...(field === 'city' ? { barangay: '' } : {})
      }
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error('Image size should be less than 5MB');
        return;
      }

      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }

      setProfilePicture(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const userId = user._id || user.id;
      if (!userId) {
        toast.error('User ID not found');
        return;
      }

      try {
        // Ensure address is properly structured
        const saveData = {
          ...formData,
          address: {
            street: formData.address?.street || '',
            city: formData.address?.city || '',
            province: formData.address?.province || '',
            barangay: formData.address?.barangay || '',
            zipCode: formData.address?.zipCode || '',
            country: formData.address?.country || 'PH'
          }
        };

        console.log('Saving profile data:', saveData);

        let finalAvatar = user.avatar || user.profilePicture;

        // Handle profile picture upload if it's a new file
        if (profilePicture instanceof File) {
          const imageFormData = new FormData();
          imageFormData.append('image', profilePicture);
          const uploadRes = await uploadService.uploadImage(imageFormData);
          if (uploadRes.data && uploadRes.data.imageUrl) {
            finalAvatar = uploadRes.data.imageUrl;
          }
        }

        const updatePayload = {
          ...saveData,
          avatar: finalAvatar
        };

        const response = await userService.updateUser(userId, updatePayload);

        if (response.data) {
          toast.success('Profile updated successfully!');
          updateUser(response.data.user);
          setIsEditing(false);
          // Reset form to updated user data
          setFormData({
            username: response.data.user.username || '',
            firstName: response.data.user.firstName || '',
            lastName: response.data.user.lastName || '',
            email: response.data.user.email || '',
            phone: response.data.user.phone || '',
            address: response.data.user.address || {
              street: '',
              city: '',
              province: '',
              barangay: '',
              zipCode: '',
              country: ''
            }
          });
        }
      } catch (error) {
        console.error('Save profile error:', error);
        toast.error('Failed to update profile');
      } finally {
        setLoading(false);
      }
    } catch (error) {
      console.error('Save profile error:', error);
      toast.error('Failed to update profile');
      setLoading(false);
    }
  };

  const handleRemovePicture = () => {
    setProfilePicture(null);
    setPreviewImage(null);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+={}\[\]|:;"'<>,.?/~`]).{8,}$/;
    if (!passwordRegex.test(passwordData.newPassword)) {
      toast.error('Password must be at least 8 characters long (14+ recommended) and contain uppercase, lowercase, numbers, and symbols');
      return;
    }

    if (passwordData.newPassword.toLowerCase() === user.username.toLowerCase() ||
      passwordData.newPassword.toLowerCase() === user.email.toLowerCase()) {
      toast.error('Password cannot be the same as your username or email');
      return;
    }

    setPasswordLoading(true);
    try {
      const response = await authService.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      toast.success(response.message || 'Password changed successfully');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleToggle2FA = async () => {
    setToggling2FA(true);
    try {
      const result = await authService.toggle2FA({ enabled: !user.twoFactorEnabled });
      if (result.success) {
        toast.success(result.message);
        // Update user in context
        updateUser({ ...user, twoFactorEnabled: !user.twoFactorEnabled });
      } else {
        toast.error(result.message || 'Failed to toggle 2FA');
      }
    } catch (error) {
      toast.error('Failed to update 2FA settings');
    } finally {
      setToggling2FA(false);
    }
  };

  // Account Upgrade Handlers
  const handleUpgradeFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    const finalValue = type === 'checkbox' ? checked : value;

    if (name.includes('.')) {
      const parts = name.split('.');
      if (parts.length === 2) {
        const [parent, child] = parts;
        setUpgradeFormData(prev => ({
          ...prev,
          [parent]: {
            ...prev[parent],
            [child]: finalValue
          }
        }));
      } else if (parts.length === 3) {
        const [p1, p2, p3] = parts;
        setUpgradeFormData(prev => ({
          ...prev,
          [p1]: {
            ...prev[p1],
            [p2]: {
              ...prev[p1][p2],
              [p3]: finalValue
            }
          }
        }));
      }
    } else {
      setUpgradeFormData(prev => ({
        ...prev,
        [name]: finalValue
      }));
    }
  };

  const handleReferenceChange = (index, field, value) => {
    const newRefs = [...upgradeFormData.references];
    newRefs[index] = { ...newRefs[index], [field]: value };
    setUpgradeFormData(prev => ({ ...prev, references: newRefs }));
  };

  const handleFileChange = (fileType, file) => {
    if (file) {
      setFiles(prev => ({
        ...prev,
        [fileType]: file
      }));
    }
  };

  const handleUpgradeSubmit = async (e) => {
    e.preventDefault();
    setUpgradeLoading(true);

    try {
      const formData = new FormData();

      // Add all form data
      console.log('=== Form Submission Started ===');
      console.log('Form Data:', upgradeFormData);
      console.log('Files:', files);

      // Validate required fields
      if (!upgradeFormData.businessName || !upgradeFormData.businessType || !upgradeFormData.taxId || !upgradeFormData.businessLicense.number) {
        toast.error('Please fill in all required fields');
        setUpgradeLoading(false);
        return;
      }

      // Root level fields
      formData.append('businessName', upgradeFormData.businessName);
      formData.append('businessType', upgradeFormData.businessType);
      formData.append('taxId', upgradeFormData.taxId);
      formData.append('legalStructure', upgradeFormData.legalStructure);
      formData.append('yearsInBusiness', upgradeFormData.yearsInBusiness);
      formData.append('numberOfEmployees', upgradeFormData.numberOfEmployees);
      formData.append('hasPhysicalStore', upgradeFormData.hasPhysicalStore);
      formData.append('businessDescription', upgradeFormData.businessDescription);

      // Nested objects
      formData.append('businessLicense', JSON.stringify({
        ...upgradeFormData.businessLicense,
        issueDate: upgradeFormData.businessLicense.issueDate ? new Date(upgradeFormData.businessLicense.issueDate).toISOString() : null,
        expiryDate: upgradeFormData.businessLicense.expiryDate ? new Date(upgradeFormData.businessLicense.expiryDate).toISOString() : null
      }));

      formData.append('contactInfo', JSON.stringify({
        email: user.email,
        phone: upgradeFormData.contactInfo.phone || user.phone,
        address: upgradeFormData.contactInfo.address
      }));

      formData.append('paymentInfo', JSON.stringify(upgradeFormData.paymentInfo));
      formData.append('references', JSON.stringify(upgradeFormData.references));

      formData.append('insurance', JSON.stringify({
        ...upgradeFormData.insurance,
        expiryDate: upgradeFormData.insurance.expiryDate ? new Date(upgradeFormData.insurance.expiryDate).toISOString() : null
      }));

      // Document uploads
      if (files.licenseDocument) formData.append('licenseDocument', files.licenseDocument);
      if (files.insuranceDocument) formData.append('insuranceDocument', files.insuranceDocument);
      if (files.governmentId) formData.append('governmentId', files.governmentId);
      if (files.businessRegistration) formData.append('businessRegistration', files.businessRegistration);
      if (files.birRegistration) formData.append('birRegistration', files.birRegistration);
      if (files.mayorsPermit) formData.append('mayorsPermit', files.mayorsPermit);
      if (files.barangayClearance) formData.append('barangayClearance', files.barangayClearance);
      if (files.storeLogo) formData.append('storeLogo', files.storeLogo);

      console.log('FormData prepared for detailed submission');

      const response = await storeApplicationService.submitApplication(formData);
      console.log('Response:', response);

      if (response.data) {
        toast.success('Application submitted successfully! We will review your application soon.');
        setShowUpgradeForm(false);
        // Reset form
        setUpgradeFormData({
          businessName: '',
          businessType: '',
          legalStructure: 'single_proprietorship',
          yearsInBusiness: 0,
          numberOfEmployees: 1,
          hasPhysicalStore: true,
          businessLicense: { number: '', issuingAuthority: '', issueDate: '', expiryDate: '' },
          taxId: '',
          contactInfo: { phone: '', email: '', address: { street: '', city: '', province: 'cavite', zipCode: '', country: 'PH' } },
          paymentInfo: { bankName: '', bankAccountName: '', bankAccountNumber: '', alternativePaymentMethod: { provider: 'GCash', accountNumber: '' } },
          businessDescription: '',
          references: [{ name: '', business: '', phone: '', email: '' }, { name: '', business: '', phone: '', email: '' }],
          insurance: { provider: '', policyNumber: '', coverageAmount: 0, expiryDate: '' }
        });
        setFiles({
          licenseDocument: null,
          insuranceDocument: null,
          governmentId: null,
          businessRegistration: null,
          birRegistration: null,
          mayorsPermit: null,
          barangayClearance: null,
          storeLogo: null,
          certifications: []
        });

        fetchApplicationStatus();
      }
    } catch (error) {
      console.error('Application submission error:', error);
      console.error('Error response:', error.response);
      const errorMessage = error.response?.data?.message || error.response?.data?.errors?.[0]?.msg || 'Failed to submit application';

      toast.error(errorMessage);
    } finally {
      setUpgradeLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 border-4 border-primary-200 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-primary-600 rounded-full border-t-transparent animate-spin"></div>
          <User className="absolute inset-0 m-auto h-8 w-8 text-primary-600 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-12 sm:pb-20 overflow-x-hidden">
      {/* Premium Header/Banner - Compacted */}
      <div className="relative h-24 sm:h-48 w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-primary-900"></div>
        <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
        <div className="absolute bottom-0 left-0 right-0 h-16 sm:h-32 bg-gradient-to-t from-[#F8FAFC] to-transparent"></div>
      </div>

      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 -mt-12 sm:-mt-24 relative z-10 w-full overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-8 w-full">

          {/* Sidebar / Stats - High Density */}
          <div className="lg:col-span-4 space-y-3 sm:space-y-6 min-w-0 w-full overflow-hidden">
            {/* User Card - Slimmed */}
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl sm:rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-white p-3 sm:p-8 group overflow-hidden">
              <div className="relative flex items-center lg:flex-col lg:items-center gap-3 lg:gap-0">
                <div className="relative lg:mb-4 shrink-0">
                  <div className="absolute -inset-2 sm:-inset-4 bg-primary-600/10 rounded-full blur-xl sm:blur-2xl"></div>
                  {previewImage || profilePicture ? (
                    <img
                      src={getImageUrl(previewImage || profilePicture)}
                      alt="Profile"
                      className="w-14 h-14 sm:w-28 sm:h-28 rounded-xl sm:rounded-[2rem] object-cover ring-2 sm:ring-4 ring-white shadow-lg relative z-10"
                    />
                  ) : (
                    <div className="w-14 h-14 sm:w-28 sm:h-28 rounded-xl sm:rounded-[2rem] bg-slate-100 flex items-center justify-center ring-2 sm:ring-4 ring-white shadow-lg relative z-10">
                      <User className="h-6 w-6 sm:h-12 sm:w-12 text-slate-300" />
                    </div>
                  )}
                  {isEditing && (
                    <label className="absolute -right-1 -bottom-1 z-20 p-1.5 bg-slate-900 text-white rounded-lg shadow-lg cursor-pointer hover:scale-110 transition-transform">
                      <Camera className="h-3 w-3" />
                      <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                    </label>
                  )}
                </div>

                <div className="min-w-0 lg:text-center flex-1">
                  <h1 className="text-sm sm:text-2xl font-black text-slate-900 tracking-tighter truncate leading-tight uppercase">
                    {user.firstName} {user.lastName}
                  </h1>
                  <p className="text-slate-400 font-bold text-[9px] sm:text-sm uppercase tracking-tight opacity-70 italic">@{user.username}</p>

                  <div className="flex flex-wrap lg:justify-center gap-1 mt-1.5 lg:mb-6">
                    <span className="px-1.5 sm:px-3 py-0.5 bg-slate-900 text-white rounded-md text-[7px] sm:text-[9px] font-black uppercase tracking-widest leading-none">
                      {user.role.replace('_', ' ')}
                    </span>
                    {user.store && (
                      <span className="px-1.5 sm:px-3 py-0.5 bg-primary-50 text-primary-700 rounded-md text-[7px] sm:text-[9px] font-black uppercase tracking-widest border border-primary-100 leading-none flex items-center gap-1">
                        <Building className="h-2 w-2" /> {user.store.name}
                      </span>
                    )}
                  </div>
                </div>

                <div className="hidden lg:grid w-full grid-cols-2 gap-2 border-t border-slate-50 pt-6">
                  <div className="text-center">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-0.5">{user.role === 'admin' ? 'Revenue' : 'Orders'}</p>
                    <p className="text-xl font-black text-slate-900 leading-none">
                      {user.role === 'admin'
                        ? `₱${(stats.totalRevenue || 0).toLocaleString()}`
                        : stats.totalOrders}
                    </p>
                  </div>
                  <div className="text-center border-l border-slate-50">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-0.5">{user.role === 'admin' ? 'Orders' : 'Bookings'}</p>
                    <p className="text-xl font-black text-primary-600 leading-none">
                      {user.role === 'admin'
                        ? (stats.totalOrders || 0)
                        : stats.totalBookings}
                    </p>
                  </div>
                  <div className="text-center border-l border-slate-50 col-span-2 pt-4">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-0.5">Adoptions</p>
                    <p className="text-xl font-black text-amber-600 leading-none">
                      {stats.totalAdoptions || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Menu - High Density */}
            <div className="space-y-2">
              <div className="bg-white/80 backdrop-blur-md rounded-xl sm:rounded-[2rem] shadow-xl shadow-slate-200/20 border border-white p-1 flex lg:block overflow-x-auto no-scrollbar scroll-smooth w-full">
                {[
                  { id: 'overview', icon: TrendingUp, label: 'Activity' },
                  { id: 'details', icon: User, label: 'Profile' },
                  { id: 'security', icon: Shield, label: 'Security' },
                  { id: 'store', icon: Building, label: 'My Store', role: 'admin' },
                  { id: 'upgrade', icon: Store, label: 'Become a Partner', role: 'customer' }
                ].filter(item => !item.role || item.role === user.role).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center gap-1.5 whitespace-nowrap px-3 sm:px-6 py-2 sm:py-4 rounded-lg sm:rounded-2xl font-black text-[9px] sm:text-xs transition-all duration-300 group ${activeTab === item.id
                      ? 'bg-slate-900 text-white shadow-lg'
                      : 'text-slate-400 hover:bg-white hover:text-slate-900'
                      }`}
                  >
                    <item.icon className={`h-3 w-3 sm:h-4 sm:w-4 ${activeTab === item.id ? 'text-primary-400' : 'text-slate-300 group-hover:text-primary-500'}`} />
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Logout Button */}
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to log out?')) {
                    logout();
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl sm:rounded-2xl bg-rose-50 text-rose-600 font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] hover:bg-rose-600 hover:text-white transition-all shadow-sm border border-rose-100 group"
              >
                <LogOut className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                Log Out
              </button>
            </div>
          </div>

          {/* Main Content Area - High Density */}
          <div className="lg:col-span-8 min-w-0 w-full">
            <div className="bg-white/90 backdrop-blur-2xl rounded-2xl sm:rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-white min-h-[400px] sm:min-h-[600px] p-3 sm:p-10 overflow-hidden relative">

              {/* Decorative gradient corner */}
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary-100 rounded-full blur-3xl opacity-30"></div>

              {activeTab === 'overview' && (
                <div className="space-y-6 sm:space-y-10 animate-in fade-in slide-in-from-right-8 duration-700">
                  <header>
                    <h2 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                      {user.role === 'admin' ? 'Store' : 'Recent'} <br />
                      <span className="text-primary-600 italic">{user.role === 'admin' ? 'Performance' : 'Activity'}</span>
                    </h2>
                    <p className="text-[9px] sm:text-sm text-slate-400 font-bold uppercase tracking-tight mt-1">
                      {user.role === 'admin' ? 'Real-time store metrics' : 'Your orders and bookings'}
                    </p>
                  </header>

                  <div className="grid grid-cols-2 gap-2 sm:gap-6">
                    <div className="p-4 sm:p-8 bg-slate-50 rounded-xl sm:rounded-[2rem] border border-slate-100 relative overflow-hidden group">
                      <div className="relative z-10">
                        <Package className="h-5 w-5 sm:h-8 sm:w-8 text-primary-600 mb-2 sm:mb-4" />
                        <h3 className="text-slate-900 font-black text-[9px] sm:text-lg uppercase tracking-tight mb-0.5">{user.role === 'admin' ? 'Total Orders' : 'My Orders'}</h3>
                        <p className="text-slate-900 font-black text-lg sm:text-3xl leading-none">
                          {user.role === 'admin' ? (stats.totalOrders || 0) : orders.length}
                        </p>
                      </div>
                    </div>
                    <div className="p-4 sm:p-8 bg-slate-50 rounded-xl sm:rounded-[2rem] border border-slate-100 relative overflow-hidden group">
                      <div className="relative z-10">
                        <Calendar className="h-5 w-5 sm:h-8 sm:w-8 text-emerald-600 mb-2 sm:mb-4" />
                        <h3 className="text-slate-900 font-black text-[9px] sm:text-lg uppercase tracking-tight mb-0.5">{user.role === 'admin' ? 'Total Bookings' : 'My Bookings'}</h3>
                        <p className="text-slate-900 font-black text-lg sm:text-3xl leading-none">
                          {user.role === 'admin' ? (stats.totalBookings || 0) : bookings.length}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-[0.3em] flex items-center gap-2">
                      Recent Orders & Bookings
                    </h4>
                    <div className="divide-y divide-slate-50 border-t border-slate-50">
                      {ordersLoading ? (
                        <div className="py-4 space-y-4">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="flex items-center justify-between p-2">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 skeleton rounded-lg shrink-0" />
                                <div className="space-y-2">
                                  <div className="h-3 w-32 skeleton" />
                                  <div className="h-2 w-20 skeleton" />
                                </div>
                              </div>
                              <div className="text-right space-y-2">
                                <div className="h-3 w-16 skeleton" />
                                <div className="h-2 w-12 skeleton" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (orders.length > 0 || bookings.length > 0 || adoptions.length > 0) ? (
                        <>
                          {/* Orders */}
                          {orders.map(order => (
                            <div key={order._id} className="py-3 flex items-center justify-between group cursor-pointer border-b border-slate-50 hover:bg-slate-50 transition-colors px-1 sm:px-2">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary-600 group-hover:text-white transition-all">
                                  <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[10px] sm:text-sm font-black text-slate-900 tracking-tight leading-none mb-1">Order #{order.orderNumber || order._id.toString().slice(-6).toUpperCase()}</p>
                                  <p className="text-[8px] sm:text-xs font-bold text-slate-400 uppercase tracking-tighter">{new Date(order.createdAt).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-[11px] sm:text-sm font-black text-slate-900 leading-none mb-1">₱{order.totalAmount?.toLocaleString()}</p>
                                <span className={`px-1.5 py-0.5 rounded text-[7px] sm:text-[9px] font-black uppercase tracking-widest ${order.status === 'delivered' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                                  {order.status}
                                </span>
                              </div>
                            </div>
                          ))}
                          {/* Bookings */}
                          {bookings.map(booking => (
                            <div key={booking._id} className="py-3 flex items-center justify-between group cursor-pointer border-b border-slate-50 hover:bg-slate-50 transition-colors px-1 sm:px-2">
                              {/* ... Booking content ... */}
                            </div>
                          ))}
                          {/* Adoption Requests */}
                          {adoptions.map(req => (
                            <div key={req._id} className="py-3 flex items-center justify-between group cursor-pointer border-b border-slate-50 hover:bg-slate-50 transition-colors px-1 sm:px-2">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-amber-50/30 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-all">
                                  <HeartIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[10px] sm:text-sm font-black text-slate-900 tracking-tight leading-none mb-1">Adopting {req.pet?.name || 'Pet'}</p>
                                  <p className="text-[8px] sm:text-xs font-bold text-slate-400 uppercase tracking-tighter">{new Date(req.createdAt).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className={`px-1.5 py-0.5 rounded text-[7px] sm:text-[9px] font-black uppercase tracking-widest ${['approved', 'ready_for_pickup', 'shipped', 'delivered'].includes(req.status) ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : req.status === 'rejected' || req.status === 'cancelled' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                                  {req.status?.replace(/_/g, ' ')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="py-12 text-center">
                          <p className="text-[9px] sm:text-sm text-slate-300 font-black uppercase tracking-widest">No Activity Records Found</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Platform Feedback Section */}
                  <div className="bg-gradient-to-br from-primary-600 to-primary-800 p-6 sm:p-10 rounded-[2.5rem] text-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
                      <div className="text-center sm:text-left">
                        <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                          <HeartIcon className="h-4 w-4 text-primary-400 fill-primary-400" />
                          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary-300">WE VALUE YOU</span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tighter leading-tight mb-2">
                          How's the <span className="italic">Experience?</span>
                        </h3>
                        <p className="text-[10px] sm:text-sm font-medium text-primary-100/70 max-w-md">
                          Your feedback helps us build a better sanctuary for all pets and owners.
                        </p>
                      </div>
                      <button
                        onClick={() => setShowFeedbackModal(true)}
                        className="w-full sm:w-auto px-8 py-4 bg-white text-slate-900 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest hover:bg-primary-50 transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-2"
                      >
                        <MessageSquare className="h-4 w-4" /> Give Feedback
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'details' && (
                <div className="space-y-8 sm:space-y-12 animate-in fade-in slide-in-from-right-8 duration-700">
                  <header className="flex justify-between items-end border-b border-slate-50 pb-6 sm:pb-8">
                    <div>
                      <h2 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                        Profile <br />
                        <span className="text-primary-600 italic">Details</span>
                      </h2>
                      <p className="text-[9px] sm:text-sm text-slate-400 font-bold uppercase tracking-tight">Your personal information</p>
                    </div>
                    {!isEditing ? (
                      <button onClick={handleEdit} className="px-4 py-2 sm:px-6 sm:py-3 bg-slate-900 text-white rounded-xl sm:rounded-2xl font-black text-[9px] sm:text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center gap-2">
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={handleSave} disabled={loading} className="px-4 py-2 sm:px-6 sm:py-3 bg-primary-600 text-white rounded-xl sm:rounded-2xl font-black text-[9px] sm:text-xs uppercase tracking-widest hover:bg-primary-700 transition-all shadow-xl shadow-primary-100 flex items-center gap-2">
                          <Save className="h-3.5 w-3.5" /> {loading ? '...' : 'Save'}
                        </button>
                        <button onClick={handleCancel} className="px-4 py-2 sm:px-6 sm:py-3 bg-slate-100 text-slate-600 rounded-xl sm:rounded-2xl font-black text-[9px] sm:text-xs uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center gap-2">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </header>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 sm:gap-x-12 sm:gap-y-10">
                    <div className="space-y-1">
                      <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">First Name</label>
                      {isEditing ? (
                        <input type="text" value={formData.firstName} onChange={(e) => handleChange('firstName', e.target.value)} className="w-full px-4 py-3 sm:px-5 sm:py-4 bg-slate-50 border-2 border-slate-50 rounded-xl sm:rounded-2xl focus:border-primary-500 focus:bg-white outline-none font-bold text-sm sm:text-base transition-all" />
                      ) : (
                        <p className="text-sm sm:text-lg font-black text-slate-900 px-1 py-1 leading-none">{user.firstName}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Last Name</label>
                      {isEditing ? (
                        <input type="text" value={formData.lastName} onChange={(e) => handleChange('lastName', e.target.value)} className="w-full px-4 py-3 sm:px-5 sm:py-4 bg-slate-50 border-2 border-slate-50 rounded-xl sm:rounded-2xl focus:border-primary-500 focus:bg-white outline-none font-bold text-sm sm:text-base transition-all" />
                      ) : (
                        <p className="text-sm sm:text-lg font-black text-slate-900 px-1 py-1 leading-none">{user.lastName}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Contact</label>
                      {isEditing ? (
                        <div className="relative">
                          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <input type="tel" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} className="w-full !pl-20 pr-4 py-3 sm:!pl-24 sm:pr-5 sm:py-4 bg-slate-50 border-2 border-slate-50 rounded-xl sm:rounded-2xl focus:border-primary-500 focus:bg-white outline-none font-bold text-sm sm:text-base transition-all" placeholder="09XX XXX XXXX" />
                        </div>
                      ) : (
                        <p className="text-sm sm:text-lg font-black text-slate-900 px-1 py-1 flex items-center gap-2 leading-none">
                          <Phone className="h-4 w-4 text-slate-300" /> {user.phone || '--'}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Email</label>
                      <p className="text-sm sm:text-lg font-black text-slate-400 px-1 py-1 flex items-center gap-2 italic leading-none truncate opacity-60">
                        <Mail className="h-4 w-4 text-slate-300" /> {user.email}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 sm:pt-10 space-y-6 sm:space-y-10">
                    <h3 className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-[0.3em] border-b border-slate-50 pb-3">Address Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 sm:gap-x-12 sm:gap-y-10">
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Street Address</label>
                        {isEditing ? (
                          <input type="text" value={formData.address.street} onChange={(e) => handleAddressChange('street', e.target.value)} className="w-full px-4 py-3 sm:px-5 sm:py-4 bg-slate-50 border-2 border-slate-50 rounded-xl sm:rounded-2xl focus:border-primary-500 focus:bg-white outline-none font-bold text-sm sm:text-base transition-all" placeholder="Sector/Street" />
                        ) : (
                          <p className="text-sm sm:text-lg font-black text-slate-900 px-1 py-1 leading-none">{user.address?.street || '--'}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">City</label>
                        {isEditing ? (
                          <select required value={formData.address.city} onChange={(e) => handleAddressChange('city', e.target.value)} className="w-full px-4 py-3 sm:px-5 sm:py-4 bg-slate-50 border-2 border-slate-50 rounded-xl sm:rounded-2xl focus:border-primary-500 focus:bg-white outline-none font-bold text-sm sm:text-base transition-all appearance-none cursor-pointer">
                            <option value="">Select City</option>
                            {cities.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        ) : (
                          <p className="text-sm sm:text-lg font-black text-slate-900 px-1 py-1 uppercase leading-none">{user.address?.city || '--'}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Barangay</label>
                        {isEditing ? (
                          <select required value={formData.address.barangay} onChange={(e) => handleAddressChange('barangay', e.target.value)} disabled={!formData.address.city} className="w-full px-4 py-3 sm:px-5 sm:py-4 bg-slate-50 border-2 border-slate-50 rounded-xl sm:rounded-2xl focus:border-primary-500 focus:bg-white outline-none font-bold text-sm sm:text-base transition-all appearance-none cursor-pointer disabled:opacity-50">
                            <option value="">Select Barangay</option>
                            {barangays.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                          </select>
                        ) : (
                          <p className="text-sm sm:text-lg font-black text-slate-900 px-1 py-1 uppercase leading-none">{user.address?.barangay || '--'}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Province</label>
                        <p className="text-sm sm:text-lg font-black text-slate-400 px-1 py-1 uppercase leading-none italic opacity-60">Cavite</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">ZIP Code</label>
                        {isEditing ? (
                          <input type="text" value={formData.address.zipCode} onChange={(e) => handleAddressChange('zipCode', e.target.value)} className="w-full px-4 py-3 sm:px-5 sm:py-4 bg-slate-50 border-2 border-slate-50 rounded-xl sm:rounded-2xl focus:border-primary-500 focus:bg-white outline-none font-bold text-sm sm:text-base transition-all" placeholder="4100" />
                        ) : (
                          <p className="text-sm sm:text-lg font-black text-slate-900 px-1 py-1 leading-none">{user.address?.zipCode || '--'}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="space-y-8 sm:space-y-12 animate-in fade-in slide-in-from-right-8 duration-700">
                  <header>
                    <h2 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                      Account <br />
                      <span className="text-primary-600 italic">Security</span>
                    </h2>
                    <p className="text-[9px] sm:text-sm text-slate-400 font-bold uppercase tracking-tight">Password and access control</p>
                  </header>

                  <div className="grid grid-cols-1 gap-3 sm:gap-6">
                    <div className="p-4 sm:p-8 bg-slate-50 rounded-xl sm:rounded-[2rem] border border-slate-50 flex items-center justify-between group hover:border-primary-200 hover:bg-white transition-all duration-500">
                      <div className="flex items-center gap-4 sm:gap-6">
                        <div className="w-10 h-10 sm:w-16 sm:h-16 bg-white rounded-lg sm:rounded-2xl shadow-sm flex items-center justify-center text-slate-600 group-hover:text-primary-600 transition-colors">
                          <Shield className="h-5 w-5 sm:h-8 sm:w-8" />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-900 text-xs sm:text-lg uppercase tracking-tight mb-0.5">Two-Factor Auth</h4>
                          <p className="text-[8px] sm:text-sm text-slate-400 font-bold uppercase tracking-tight opacity-70 leading-none">
                            {user.twoFactorEnabled ? 'Currently Enabled' : 'Currently Disabled'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleToggle2FA}
                        disabled={toggling2FA}
                        className={`px-3 py-1.5 sm:px-6 sm:py-2.5 rounded-lg sm:rounded-xl font-black text-[8px] sm:text-xs uppercase tracking-widest transition-all ${user.twoFactorEnabled
                          ? 'bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-600 hover:text-white'
                          : 'bg-slate-900 text-white hover:bg-primary-600 shadow-xl shadow-slate-200'
                          }`}
                      >
                        {toggling2FA ? '...' : user.twoFactorEnabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>

                    <div className="p-4 sm:p-8 bg-slate-50 rounded-xl sm:rounded-[2rem] border border-slate-50 group hover:border-primary-200 hover:bg-white transition-all duration-500">
                      <div className="flex items-center gap-4 sm:gap-6 mb-8 border-b border-slate-100 pb-6">
                        <div className="w-10 h-10 sm:w-16 sm:h-16 bg-white rounded-lg sm:rounded-2xl shadow-sm flex items-center justify-center text-slate-600 group-hover:text-primary-600 transition-colors">
                          <Lock className="h-5 w-5 sm:h-8 sm:w-8" />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-900 text-xs sm:text-lg uppercase tracking-tight mb-0.5">Security Updates</h4>
                          <p className="text-[8px] sm:text-sm text-slate-400 font-bold uppercase tracking-tight opacity-70 leading-none">Modify your access credentials</p>
                        </div>
                      </div>

                      <form onSubmit={handlePasswordChange} className="space-y-6">
                        <div className="grid grid-cols-1 gap-6">
                          <div className="space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Current Password</label>
                            <div className="relative">
                              <input
                                type={showCurrentPassword ? 'text' : 'password'}
                                value={passwordData.currentPassword}
                                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                                className="w-full px-4 py-3 sm:px-5 sm:py-4 bg-white border-2 border-slate-50 rounded-xl sm:rounded-2xl focus:border-primary-500 outline-none font-bold text-sm transition-all"
                                required
                              />
                              <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                              <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">New Password</label>
                              <div className="relative">
                                <input
                                  type={showNewPassword ? 'text' : 'password'}
                                  value={passwordData.newPassword}
                                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                  className="w-full px-4 py-3 sm:px-5 sm:py-4 bg-white border-2 border-slate-50 rounded-xl sm:rounded-2xl focus:border-primary-500 outline-none font-bold text-sm transition-all"
                                  required
                                />
                                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Confirm New Password</label>
                              <input
                                type="password"
                                value={passwordData.confirmPassword}
                                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                className="w-full px-4 py-3 sm:px-5 sm:py-4 bg-white border-2 border-slate-50 rounded-xl sm:rounded-2xl focus:border-primary-500 outline-none font-bold text-sm transition-all"
                                required
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100 mt-6">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight max-w-xs">
                            ENFORCE: 8+ CHARS • MIXED CASE • NUMBERS • SYMBOLS
                          </p>
                          <button
                            type="submit"
                            disabled={passwordLoading}
                            className="w-full sm:w-auto px-8 py-3 bg-slate-900 text-white rounded-xl sm:rounded-2xl font-black text-[9px] sm:text-xs uppercase tracking-widest hover:bg-primary-600 transition-all shadow-xl shadow-slate-200"
                          >
                            {passwordLoading ? 'Encrypting...' : 'Update Password'}
                          </button>
                        </div>
                      </form>
                    </div>

                    <div className="p-4 sm:p-8 bg-slate-50 rounded-xl sm:rounded-[2rem] border border-slate-50 flex items-center justify-between group hover:border-primary-200 hover:bg-white transition-all duration-500">
                      <div className="flex items-center gap-4 sm:gap-6">
                        <div className="w-10 h-10 sm:w-16 sm:h-16 bg-white rounded-lg sm:rounded-2xl shadow-sm flex items-center justify-center text-slate-600 group-hover:text-primary-600 transition-colors">
                          <Package className="h-5 w-5 sm:h-8 sm:w-8" />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-900 text-xs sm:text-lg uppercase tracking-tight mb-0.5">Activity Logs</h4>
                          <p className="text-[8px] sm:text-sm text-slate-400 font-bold uppercase tracking-tight opacity-70 leading-none">Recent login activity</p>
                        </div>
                      </div>
                      <button onClick={() => setShowActivityModal(true)} className="px-3 py-1.5 sm:px-6 sm:py-2.5 bg-slate-900 text-white rounded-lg sm:rounded-xl font-black text-[8px] sm:text-xs uppercase tracking-widest hover:bg-primary-600 transition-all">Review Logs</button>
                    </div>
                  </div>

                  <div className="bg-rose-50/50 p-6 sm:p-10 rounded-xl sm:rounded-[2.5rem] border border-rose-100">
                    <h4 className="text-rose-900 font-black text-sm sm:text-xl uppercase tracking-tighter mb-2 sm:mb-3 leading-none">Delete Account</h4>
                    <p className="text-rose-700 font-medium text-[9px] sm:text-sm mb-4 sm:mb-6 leading-relaxed max-w-xl opacity-80">
                      Deletion is irreversible. All account data and information will be permanently removed.
                    </p>
                    <button className="px-4 py-2 sm:px-8 sm:py-3 bg-rose-600 text-white rounded-lg sm:rounded-2xl font-black text-[9px] sm:text-xs uppercase tracking-widest hover:bg-rose-700 transition-all shadow-xl shadow-rose-200">
                      Delete Account
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'store' && (
                <div className="space-y-8 sm:space-y-12 animate-in fade-in slide-in-from-right-8 duration-700">
                  <header>
                    <h2 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                      Store <br />
                      <span className="text-primary-600 italic">Information</span>
                    </h2>
                    <p className="text-[9px] sm:text-sm text-slate-400 font-bold uppercase tracking-tight">Your business profile data</p>
                  </header>

                  {user.store ? (
                    <div className="space-y-8">
                      <div className="p-6 sm:p-10 bg-slate-900 rounded-3xl text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-600/20 rounded-full blur-[80px] -mr-32 -mt-32"></div>
                        <div className="relative z-10 flex items-center gap-6">
                          {user.store.logo ? (
                            <img src={user.store.logo} alt="" className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-white/10" />
                          ) : (
                            <div className="w-16 h-16 sm:w-24 sm:h-24 bg-white/10 rounded-2xl flex items-center justify-center border-2 border-white/10">
                              <Building className="h-8 w-8 sm:h-12 sm:w-12 text-white/30" />
                            </div>
                          )}
                          <div>
                            <p className="text-[10px] font-black text-primary-400 uppercase tracking-widest mb-1">{user.store.businessType?.replace('_', ' ')}</p>
                            <h3 className="text-xl sm:text-4xl font-black uppercase tracking-tight mb-2">{user.store.name}</h3>
                            <div className="flex items-center gap-3 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {user.store.contactInfo?.address?.city}</span>
                              <span className="w-1 h-1 rounded-full bg-white/20"></span>
                              <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> {user.store.verificationStatus}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl">
                          <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Users className="h-3 w-3" /> Contact Details
                          </h4>
                          <div className="space-y-4">
                            <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Email Address</p>
                              <p className="text-sm font-black text-slate-900">{user.store.contactInfo?.email}</p>
                            </div>
                            <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Phone Number</p>
                              <p className="text-sm font-black text-slate-900">{user.store.contactInfo?.phone}</p>
                            </div>
                          </div>
                        </div>

                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl">
                          <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Globe className="h-3 w-3" /> Digital Presence
                          </h4>
                          <div className="space-y-4">
                            <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Website</p>
                              <p className="text-sm font-black text-slate-900 truncate">{user.store.contactInfo?.website || 'No website registered'}</p>
                            </div>
                            <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Social Media</p>
                              <div className="flex gap-2">
                                {user.store.socialMedia?.facebook && <span className="text-[10px] font-black text-primary-600">Facebook</span>}
                                {user.store.socialMedia?.instagram && <span className="text-[10px] font-black text-primary-600">Instagram</span>}
                                {!user.store.socialMedia?.facebook && !user.store.socialMedia?.instagram && <p className="text-sm font-black text-slate-400 italic">None</p>}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-center pt-8">
                        <a
                          href="/admin/store"
                          className="px-10 py-4 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] text-[10px] hover:bg-primary-600 transition-all shadow-2xl active:scale-95 flex items-center gap-3"
                        >
                          <Settings className="h-4 w-4" /> Manage Full Store Profile
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="py-20 text-center bg-slate-50 rounded-[3rem] border border-dashed border-slate-200">
                      <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                        <AlertCircle className="h-8 w-8 text-slate-300" />
                      </div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">No Store Linked</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest max-w-xs mx-auto">
                        Your account is not currently associated with a verified store entity.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'upgrade' && (
                <div className="space-y-8 sm:space-y-12 animate-in fade-in slide-in-from-right-8 duration-700">
                  <header>
                    <h2 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                      Store <br />
                      <span className="text-primary-600 italic">Partner</span>
                    </h2>
                    <p className="text-[9px] sm:text-sm text-slate-400 font-bold uppercase tracking-tight">Join our store network</p>
                  </header>

                  {!showUpgradeForm ? (
                    <div className="space-y-4 sm:space-y-8">
                      {application ? (
                        <div className="relative group">
                          <div className="absolute inset-0 bg-amber-500/5 rounded-2xl sm:rounded-[2.5rem] blur-xl"></div>
                          <div className="relative bg-white p-6 sm:p-10 rounded-2xl sm:rounded-[2.5rem] border border-amber-100 shadow-xl shadow-amber-900/5">
                            <div className="flex items-center justify-between mb-6 sm:mb-8">
                              <div className="flex items-center gap-3 sm:gap-4">
                                <div className="w-10 h-10 sm:w-14 sm:h-14 bg-amber-50 rounded-xl sm:rounded-2xl flex items-center justify-center text-amber-600">
                                  <Clock className="h-5 w-5 sm:h-7 sm:w-7" />
                                </div>
                                <div>
                                  <p className="text-[7px] sm:text-[10px] font-black text-amber-600 uppercase tracking-widest leading-none mb-0.5">Application {application.status}</p>
                                  <h4 className="text-sm sm:text-2xl font-black text-slate-900 uppercase tracking-tight truncate">{application.businessName}</h4>
                                </div>
                              </div>
                              <span className={`px-2 py-0.5 sm:px-4 sm:py-1.5 rounded sm:rounded-full text-[7px] sm:text-[10px] font-black uppercase tracking-widest border ${
                                application.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                application.status === 'rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                'bg-amber-50 text-amber-600 border-amber-100'
                              }`}>
                                {application.status}
                              </span>
                            </div>
                            <p className="text-slate-500 font-medium text-[9px] sm:text-sm leading-relaxed mb-6 sm:mb-8 opacity-80">
                              {application.status === 'approved' ? 'Your store application has been approved! You can now access your Store Owner Dashboard.' :
                               application.status === 'rejected' ? `Your application was rejected. Reason: ${application.rejectionReason}` :
                               'Your application is currently being verified by our administrators. Typical wait time is 24-48 hours.'}
                            </p>
                             {/* Verification Progress Bar */}
                             {application.status !== 'approved' && application.status !== 'rejected' && (
                               <div className="space-y-2 mb-8 animate-in fade-in slide-in-from-top-4 duration-1000">
                                 <div className="flex justify-between items-end">
                                   <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Verification Strength</p>
                                   <p className="text-xs font-black text-amber-600 italic">Level {Math.floor((application.verificationScore || 0) / 20) + 1}</p>
                                 </div>
                                 <div className="h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-50">
                                   <div 
                                     className="h-full bg-gradient-to-r from-amber-500 to-primary-600 rounded-full transition-all duration-[2000ms] shadow-sm relative overflow-hidden"
                                     style={{ width: `${Math.max(15, application.verificationScore || 25)}%` }}
                                   >
                                     <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                   </div>
                                 </div>
                                 <p className="text-[7px] font-bold text-slate-400 uppercase tracking-tight">Complete more profile details to increase approval probability.</p>
                               </div>
                             )}
                            {application.status === 'rejected' && (
                              <button onClick={() => setShowUpgradeForm(true)} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-xs">
                                Edit & Re-submit
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="relative group overflow-hidden bg-slate-900 rounded-2xl sm:rounded-[3rem] p-6 sm:p-16 border border-white/5">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-600/20 rounded-full blur-[80px] -mr-32 -mt-32 transition-all duration-700 group-hover:scale-150"></div>
                          <div className="relative z-10 flex flex-col items-center lg:items-start text-center lg:text-left">
                            <h3 className="text-2xl sm:text-5xl font-black text-white leading-none uppercase tracking-tighter mb-4 sm:mb-6">
                              Empower <br />
                              <span className="text-primary-500 italic">Your Shop</span>
                            </h3>
                            <p className="text-slate-400 font-medium text-[10px] sm:text-lg leading-relaxed max-w-xl mb-8 sm:mb-10 opacity-70">
                              To apply as a store owner, prepare your business documents for verification. Once approved, you'll gain access to your Store Owner Dashboard.
                            </p>
                            <button onClick={() => setShowUpgradeForm(true)} className="px-6 py-3 sm:px-12 sm:py-5 bg-white text-slate-900 rounded-xl sm:rounded-[2rem] font-black uppercase tracking-[0.2em] text-[10px] sm:text-sm hover:bg-primary-50 transition-all active:scale-95 shadow-2xl shadow-black/20">
                              Start Application
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleUpgradeSubmit} className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-10">
                      {/* Section: Store Information */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                          <Building className="h-5 w-5 text-primary-600" />
                          <h3 className="text-sm sm:text-lg font-black text-slate-900 uppercase tracking-tighter">Store Information</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                          <div className="space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Store Name *</label>
                            <input required type="text" name="businessName" value={upgradeFormData.businessName} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 focus:bg-white outline-none font-bold text-sm transition-all" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Store Contact Phone *</label>
                            <input required type="tel" name="contactInfo.phone" value={upgradeFormData.contactInfo.phone} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 focus:bg-white outline-none font-bold text-sm transition-all" placeholder="09XX XXX XXXX" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Type of Products/Services *</label>
                            <select required name="businessType" value={upgradeFormData.businessType} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 focus:bg-white outline-none font-bold text-sm transition-all">
                              <option value="">Select Category</option>
                              <option value="pet_store">Pet Store</option>
                              <option value="veterinary">Veterinary Service</option>
                              <option value="grooming">Grooming Service</option>
                              <option value="breeder">Certified Breeder</option>
                              <option value="training">Training Facility</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Legal Structure *</label>
                            <select required name="legalStructure" value={upgradeFormData.legalStructure} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 focus:bg-white outline-none font-bold text-sm transition-all cursor-pointer">
                              <option value="single_proprietorship">Sole Proprietorship (DTI)</option>
                              <option value="partnership">Partnership (SEC)</option>
                              <option value="corporation">Corporation (SEC)</option>
                            </select>
                          </div>
                          <div className="md:col-span-2 space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Store Address (Street/Unit) *</label>
                            <input required type="text" name="contactInfo.address.street" value={upgradeFormData.contactInfo.address.street} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 focus:bg-white outline-none font-bold text-sm transition-all" placeholder="House No., Street Name, Phase..." />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">City/Municipality *</label>
                            <select required name="contactInfo.address.city" value={upgradeFormData.contactInfo.address.city} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 outline-none font-bold text-sm transition-all">
                              <option value="">Select City</option>
                                {getCitiesByProvince('cavite').map(city => (
                                  <option key={city.value} value={city.value}>{city.label}</option>
                                ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Barangay *</label>
                            <select required name="contactInfo.address.barangay" value={upgradeFormData.contactInfo.address.barangay} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 outline-none font-bold text-sm transition-all">
                              <option value="">Select Barangay</option>
                              {upgradeFormData.contactInfo.address.city && getBarangaysByCity(upgradeFormData.contactInfo.address.city).map(barangay => (
                                  <option key={barangay.value} value={barangay.value}>{barangay.label}</option>
                                ))}
                            </select>
                          </div>
                          <div className="md:col-span-2 space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Business Description *</label>
                            <textarea required name="businessDescription" value={upgradeFormData.businessDescription} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 focus:bg-white outline-none font-bold text-sm transition-all min-h-[100px]" placeholder="Brief description of your business..." />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mt-6">
                          <div className="space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Store Logo *</label>
                            <label className="relative group cursor-pointer block">
                              <div className="w-full p-4 bg-white border-2 border-dashed border-slate-200 rounded-2xl group-hover:border-primary-500 transition-all flex items-center justify-center gap-4">
                                <Camera className="h-5 w-5 text-slate-400 group-hover:text-primary-600" />
                                <span className="text-sm font-bold text-slate-500 uppercase">
                                  {files.storeLogo ? files.storeLogo.name : 'Select Logo Image'}
                                </span>
                              </div>
                              <input type="file" required className="hidden" accept="image/*" onChange={(e) => handleFileChange('storeLogo', e.target.files[0])} />
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Section: Required Documents */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                          <FileText className="h-5 w-5 text-primary-600" />
                          <h3 className="text-sm sm:text-lg font-black text-slate-900 uppercase tracking-tighter">Required Documents</h3>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Please upload clear copies of the following documents (PDF or Image)</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Govt ID */}
                          <div className="space-y-2">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Valid Government-Issued ID *</label>
                            <label className="relative group cursor-pointer block">
                              <div className="w-full p-3 bg-white border-2 border-dashed border-slate-100 rounded-xl group-hover:border-primary-500 transition-all flex items-center gap-3">
                                <Shield className="h-4 w-4 text-slate-400" />
                                <span className="text-xs font-bold text-slate-500 truncate">{files.governmentId ? files.governmentId.name : 'Choose File'}</span>
                              </div>
                              <input type="file" required className="hidden" onChange={(e) => handleFileChange('governmentId', e.target.files[0])} />
                            </label>
                          </div>

                          {/* Business Registration */}
                          <div className="space-y-2">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Business Registration (DTI/SEC) *</label>
                            <label className="relative group cursor-pointer block">
                              <div className="w-full p-3 bg-white border-2 border-dashed border-slate-100 rounded-xl group-hover:border-primary-500 transition-all flex items-center gap-3">
                                <FileText className="h-4 w-4 text-slate-400" />
                                <span className="text-xs font-bold text-slate-500 truncate">{files.businessRegistration ? files.businessRegistration.name : 'Choose File'}</span>
                              </div>
                              <input type="file" required className="hidden" onChange={(e) => handleFileChange('businessRegistration', e.target.files[0])} />
                            </label>
                          </div>

                          {/* Mayor's Permit */}
                          <div className="space-y-2">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Mayor's/Business Permit *</label>
                            <label className="relative group cursor-pointer block">
                              <div className="w-full p-3 bg-white border-2 border-dashed border-slate-100 rounded-xl group-hover:border-primary-500 transition-all flex items-center gap-3">
                                <Check className="h-4 w-4 text-slate-400" />
                                <span className="text-xs font-bold text-slate-500 truncate">{files.mayorsPermit ? files.mayorsPermit.name : 'Choose File'}</span>
                              </div>
                              <input type="file" required className="hidden" onChange={(e) => handleFileChange('mayorsPermit', e.target.files[0])} />
                            </label>
                          </div>

                          {/* BIR Form 2303 */}
                          <div className="space-y-2">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">BIR Certificate (Form 2303) *</label>
                            <label className="relative group cursor-pointer block">
                              <div className="w-full p-3 bg-white border-2 border-dashed border-slate-100 rounded-xl group-hover:border-primary-500 transition-all flex items-center gap-3">
                                <Zap className="h-4 w-4 text-slate-400" />
                                <span className="text-xs font-bold text-slate-500 truncate">{files.birRegistration ? files.birRegistration.name : 'Choose File'}</span>
                              </div>
                              <input type="file" required className="hidden" onChange={(e) => handleFileChange('birRegistration', e.target.files[0])} />
                            </label>
                          </div>

                          {/* Barangay Clearance */}
                          <div className="space-y-2">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Barangay Clearance (Optional)</label>
                            <label className="relative group cursor-pointer block">
                              <div className="w-full p-3 bg-white border-2 border-dashed border-slate-100 rounded-xl group-hover:border-primary-500 transition-all flex items-center gap-3">
                                <MapPin className="h-4 w-4 text-slate-400" />
                                <span className="text-xs font-bold text-slate-500 truncate">{files.barangayClearance ? files.barangayClearance.name : 'Choose File'}</span>
                              </div>
                              <input type="file" className="hidden" onChange={(e) => handleFileChange('barangayClearance', e.target.files[0])} />
                            </label>
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Tax ID (TIN) Number *</label>
                            <input required type="text" name="taxId" value={upgradeFormData.taxId} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 outline-none font-bold text-sm" placeholder="000-000-000-000" />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                          <div className="space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Operational License Number *</label>
                            <input required type="text" name="businessLicense.number" value={upgradeFormData.businessLicense.number} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 outline-none font-bold text-sm transition-all" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Issuing Authority *</label>
                            <input required type="text" name="businessLicense.issuingAuthority" value={upgradeFormData.businessLicense.issuingAuthority} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 outline-none font-bold text-sm transition-all" />
                          </div>
                        </div>
                      </div>

                      {/* Section: Payment Information */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                          <CreditCard className="h-5 w-5 text-primary-600" />
                          <h3 className="text-sm sm:text-lg font-black text-slate-900 uppercase tracking-tighter">Payment Information</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Bank Account Name *</label>
                            <input required type="text" name="paymentInfo.bankAccountName" value={upgradeFormData.paymentInfo.bankAccountName} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 outline-none font-bold text-sm" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Bank Name *</label>
                            <input required type="text" name="paymentInfo.bankName" value={upgradeFormData.paymentInfo.bankName} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 outline-none font-bold text-sm" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-widest block ml-1">Bank Account Number *</label>
                            <input required type="text" name="paymentInfo.bankAccountNumber" value={upgradeFormData.paymentInfo.bankAccountNumber} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-50 rounded-xl focus:border-primary-500 outline-none font-bold text-sm" />
                          </div>
                        </div>
                        
                        <div className="p-6 bg-primary-50 rounded-[2rem] border border-primary-100 space-y-4">
                          <p className="text-[10px] font-black text-primary-600 uppercase tracking-widest">Alternative Payment Method</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block ml-1">Provider</label>
                              <select name="paymentInfo.alternativePaymentMethod.provider" value={upgradeFormData.paymentInfo.alternativePaymentMethod.provider} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-white border border-primary-100 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-bold text-sm">
                                <option value="GCash">GCash</option>
                                <option value="PayMaya">PayMaya</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block ml-1">Account Number</label>
                              <input type="text" name="paymentInfo.alternativePaymentMethod.accountNumber" value={upgradeFormData.paymentInfo.alternativePaymentMethod.accountNumber} onChange={handleUpgradeFormChange} className="w-full px-4 py-3 bg-white border border-primary-100 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-bold text-sm" placeholder="09XX XXX XXXX" />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 pt-10 border-t border-slate-100">
                        <button type="submit" disabled={upgradeLoading} className="flex-1 px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] sm:text-xs hover:bg-primary-600 transition-all shadow-2xl shadow-slate-200 disabled:opacity-50 active:scale-95">
                          {upgradeLoading ? 'Transmitting Application...' : 'Submit Application for Review'}
                        </button>
                        <button type="button" onClick={() => setShowUpgradeForm(false)} className="px-8 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] sm:text-xs hover:bg-slate-200 transition-all">
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      
      <PlatformFeedbackModal 
        isOpen={showFeedbackModal} 
        onClose={() => setShowFeedbackModal(false)} 
      />

      {/* Activity Logs Modal */}
      {showActivityModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl animate-fade-in relative border border-slate-100">
            <button onClick={() => setShowActivityModal(false)} className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-900 transition-colors">
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter">Security Log</h3>
                <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">Your account activity trail</p>
              </div>
            </div>

            <div className="space-y-4 relative">
              <div className="absolute left-[15px] top-4 bottom-4 w-px bg-slate-100" />
              {activityLogs && activityLogs.length > 0 ? activityLogs.map((log, index) => (
                <div key={log._id || index} className="relative pl-10 pr-4 py-4 bg-slate-50/50 hover:bg-white rounded-2xl border border-transparent hover:border-slate-100 transition-all group">
                  <div className="absolute left-[11px] top-[26px] w-2.5 h-2.5 rounded-full bg-white border-2 border-indigo-200 group-hover:border-indigo-500 transition-colors z-10 shadow-sm" />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] sm:text-xs font-black text-slate-900 uppercase tracking-widest">{log.action || 'System Event'}</span>
                    <span className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium">{log.details || 'No additional details provided'}</p>
                  {log.ipAddress && (
                     <div className="mt-2 text-[8px] font-bold text-slate-300 uppercase tracking-widest px-2 py-0.5 bg-slate-100/50 rounded inline-block">
                       IP: {log.ipAddress}
                     </div>
                  )}
                </div>
              )) : (
                <div className="pl-10 py-8 text-slate-400 text-sm font-bold uppercase tracking-widest">
                  No activity logs found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;

