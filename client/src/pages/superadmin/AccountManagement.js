import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { userService } from '../../services/apiService';
import {
  Users,
  Eye,
  EyeOff,
  Search,
  Filter,
  Download,
  Key,
  Mail,
  Phone,
  Calendar,
  DollarSign,
  X,
  Shield,
  Zap,
  Target,
  Globe,
  MoreVertical,
  UserPlus,
  ChevronDown
} from 'lucide-react';

const AccountManagement = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    role: '',
    isActive: '',
    search: '',
    dateRange: ''
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
  });
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, [filters, pagination.currentPage]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const params = {
        ...filters,
        page: pagination.currentPage,
        limit: 20
      };

      const response = await userService.getAllUsers(params);

      if (response.data && response.data.users) {
        setAccounts(response.data.users);
        setPagination(response.data.pagination || pagination);
      } else {
        setAccounts([]);
      }
    } catch (error) {
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  const handlePageChange = (page) => {
    setPagination(prev => ({ ...prev, currentPage: page }));
  };

  const exportAccounts = () => {
    const csvContent = [
      ['Username', 'Email', 'Role', 'First Name', 'Last Name', 'Phone', 'Status', 'Created Date'].join(','),
      ...accounts.map(account => [
        account.username,
        account.email,
        account.role,
        account.firstName,
        account.lastName,
        account.phone || '',
        account.isActive ? 'Active' : 'Inactive',
        new Date(account.createdAt).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleToggleStatus = async (user) => {
    try {
      let reason = null;
      if (user.isActive) {
        reason = window.prompt(
          'Reason for deactivation (optional):', 
          'Account disabled by administrator for security or policy review.'
        );
        if (reason === null) return; // User cancelled prompt
      }

      await userService.toggleUserStatus(user._id, { reason });
      toast.success(`User ${user.isActive ? 'deactivated' : 'activated'} successfully`);
      fetchAccounts();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleDeleteAccount = async (userId, username) => {
    if (window.confirm(`Delete user "${username}"? This cannot be undone.`)) {
      try {
        await userService.deleteUser(userId);
        toast.success('User deleted successfully');
        fetchAccounts();
      } catch (error) {
        toast.error('Failed to delete user');
      }
    }
  };

  const handleViewCredentials = async (account) => {
    try {
      const response = await userService.getUserCredentials(account._id);
      const userData = response.data?.user || response.user || response.data;
      if (userData) {
        setSelectedAccount(userData);
        setShowCredentialsModal(true);
      } else {
        toast.error('Failed to load user info');
      }
    } catch (error) {
      toast.error('Access denied');
    }
  };

  const getRoleProps = (role) => {
    const props = {
      super_admin: { color: 'rose', label: 'SUPER ADMIN' },
      admin: { color: 'primary', label: 'STORE OWNER' },
      staff: { color: 'blue', label: 'STAFF' },
      customer: { color: 'emerald', label: 'CUSTOMER' }
    };
    return props[role] || { color: 'slate', label: 'USER' };
  };

  if (loading && accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary-600 animate-[loading_1s_infinite_ease-in-out] w-1/2"></div>
        </div>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Loading Users...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Premium Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-3 w-3 text-primary-600" />
            <span className="text-[9px] font-black text-primary-600 uppercase tracking-[0.4em]">ADMIN PANEL : USERS</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
            User <br /> <span className="text-primary-600 italic">Management</span>
          </h1>
          <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">Manage platform users and store owners</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={exportAccounts} className="flex-1 sm:flex-none px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-2">
            <Download className="h-4 w-4" /> Export Users CSV
          </button>
        </div>
      </div>

      {/* Identity HUD Filter - High Contrast & Always Visible */}
      <div className="bg-slate-900 p-2 rounded-[2.5rem] shadow-xl border border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <div className="md:col-span-4 relative group">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-3">
              <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
            </div>
            <input
              type="text" placeholder="QUERY IDENTITY: NAME, EMAIL, USERNAME..."
              value={filters.search} onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full pl-16 pr-4 py-5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-3xl outline-none focus:ring-2 focus:ring-primary-500/50 placeholder:text-slate-600 transition-all font-sans"
            />
          </div>
          <div className="md:col-span-3 relative">
            <div className="absolute left-6 top-1/2 -translate-y-1/2">
              <Shield className="h-3.5 w-3.5 text-primary-500" />
            </div>
            <select
              value={filters.role} onChange={(e) => handleFilterChange('role', e.target.value)}
              className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-3xl pl-14 pr-6 py-5 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer font-sans"
            >
              <option value="" className="bg-slate-900 text-white font-black">ALL ROLES</option>
              <option value="super_admin" className="bg-slate-900 text-white font-black">SUPER ADM: MASTER</option>
              <option value="admin" className="bg-slate-900 text-white font-black">ADMIN: STORE OWNER</option>
              <option value="customer" className="bg-slate-900 text-white font-black">USER: CUSTOMER</option>
            </select>
          </div>
          <div className="md:col-span-3 relative">
            <div className="absolute left-6 top-1/2 -translate-y-1/2">
              <Zap className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <select
              value={filters.isActive} onChange={(e) => handleFilterChange('isActive', e.target.value)}
              className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-3xl pl-14 pr-6 py-5 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer font-sans"
            >
              <option value="" className="bg-slate-900 text-white font-black">ANY STATUS</option>
              <option value="true" className="bg-slate-900 text-white font-black">STATUS: ACTIVE</option>
              <option value="false" className="bg-slate-900 text-white font-black">STATUS: DISABLED</option>
            </select>
          </div>
          <div className="md:col-span-2 relative">
            <div className="absolute left-6 top-1/2 -translate-y-1/2">
              <Calendar className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <select
              value={filters.dateRange} onChange={(e) => handleFilterChange('dateRange', e.target.value)}
              className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-3xl pl-14 pr-6 py-5 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer font-sans"
            >
              <option value="" className="bg-slate-900 text-white font-black">ALL TIME</option>
              <option value="today" className="bg-slate-900 text-white font-black">TODAY</option>
              <option value="week" className="bg-slate-900 text-white font-black">THIS WEEK</option>
              <option value="month" className="bg-slate-900 text-white font-black">THIS MONTH</option>
            </select>
          </div>
        </div>
      </div>

      {/* Fleet Identity Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts.map((user) => {
          const role = getRoleProps(user.role);
          return (
            <div key={user._id} className="group bg-white border border-slate-100 rounded-[2.5rem] p-6 shadow-sm hover:shadow-2xl transition-all relative overflow-hidden flex flex-col">
              <div className="absolute top-0 right-0 p-6 flex flex-col items-end gap-2">
                <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${user.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {user.isActive ? 'ACTIVE' : 'DISABLED'}
                </span>
                {user.isActive && (
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      user.lastSeen && (new Date() - new Date(user.lastSeen)) < 5 * 60 * 1000 
                        ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
                        : 'bg-slate-300'
                    }`} />
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">
                      {user.lastSeen && (new Date() - new Date(user.lastSeen)) < 5 * 60 * 1000 ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                )}
              </div>

              <div className="w-12 h-12 rounded-2xl mb-4 bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary-600 group-hover:text-white transition-all group-hover:rotate-3 shadow-inner">
                <Users className="h-6 w-6" />
              </div>

              <div className="flex-1">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none mb-1 group-hover:text-primary-600 transition-colors">{user.username}</h3>
                <p className={`text-[9px] font-black text-${role.color}-500 uppercase tracking-widest mb-4 italic`}>{role.label}</p>

                <div className="space-y-3 pt-4 border-t border-slate-50">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3 w-3 text-slate-300" />
                    <span className="text-[10px] font-bold text-slate-500 lowercase truncate tracking-tight">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="h-3 w-3 text-slate-300" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">JOINED: {new Date(user.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {/* Action Suite - Always visible for better accessibility */}
              <div className="flex gap-2 mt-8 py-4 border-t border-slate-50">
                <button
                  onClick={() => handleViewCredentials(user)}
                  className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-primary-600 shadow-lg flex items-center justify-center gap-2"
                >
                  <Key className="h-3 w-3" /> Access
                </button>
                <button
                  onClick={() => handleToggleStatus(user)}
                  className={`p-3 rounded-xl transition-all ${user.isActive ? 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'}`}
                >
                  <Zap className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteAccount(user._id, user.username)}
                  className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pager HUD */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 bg-white border border-slate-100 p-4 rounded-[2rem] w-fit mx-auto shadow-sm">
          <button
            disabled={!pagination.hasPrev} onClick={() => handlePageChange(pagination.currentPage - 1)}
            className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-100 disabled:opacity-20 transition-all font-black text-[9px] uppercase tracking-widest"
          >
            MOD_REV
          </button>
          <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest whitespace-nowrap">
            Page: <span className="text-primary-600 italic px-1">{pagination.currentPage}</span> / {pagination.totalPages}
          </span>
          <button
            disabled={!pagination.hasNext} onClick={() => handlePageChange(pagination.currentPage + 1)}
            className="p-3 bg-slate-900 text-white rounded-xl hover:bg-primary-600 disabled:opacity-20 transition-all font-black text-[9px] uppercase tracking-widest"
          >
            MOD_FWD
          </button>
        </div>
      )}

      {/* Credentials Terminal Modal */}
      {showCredentialsModal && selectedAccount && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-white rounded-[3rem] max-w-4xl w-full shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="h-3 w-3 text-primary-600" />
                  <span className="text-[9px] font-black text-primary-600 uppercase tracking-[0.4em]">Security Sublayer</span>
                </div>
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                  Identity <span className="text-primary-600 italic">#{selectedAccount.username.toUpperCase()}</span>
                </h2>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Global Citizen Access Node</p>
              </div>
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-10 no-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Visual Identity Assets */}
                <div className="space-y-8">
                  <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden shadow-2xl">
                    <Target className="absolute -bottom-10 -right-10 w-48 h-48 opacity-10 animate-pulse" />
                    <div className="relative z-10 space-y-6">
                      <div className="flex justify-between items-start">
                        <label className="text-[10px] font-black text-primary-500 uppercase tracking-[0.5em] block">Status</label>
                        <span className={`px-3 py-1 bg-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest ${selectedAccount.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {selectedAccount.isActive ? 'ACTIVE' : 'DISABLED'}
                        </span>
                      </div>
                      <p className="text-4xl font-black tracking-tighter uppercase">{selectedAccount.firstName} {selectedAccount.lastName}</p>
                      <div className="flex gap-4">
                        <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-2xl">
                          <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Role</p>
                          <p className="text-sm font-black text-primary-400 uppercase">{getRoleProps(selectedAccount.role).label}</p>
                        </div>
                        <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-2xl">
                          <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">State</p>
                          <p className="text-sm font-black text-emerald-400 uppercase">NORMAL</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-[2.5rem] p-8 border border-slate-100">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                      Contact Routing
                    </h3>
                    <div className="space-y-6">
                      <div className="flex items-center justify-between group">
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Email</p>
                          <p className="text-[12px] font-black text-slate-900 lowercase italic opacity-80">{selectedAccount.email}</p>
                        </div>
                        <button onClick={() => navigator.clipboard.writeText(selectedAccount.email)} className="opacity-0 group-hover:opacity-100 p-2 bg-white rounded-lg shadow-sm text-primary-600">
                          <Download className="h-3 w-3" />
                        </button>
                      </div>
                      {selectedAccount.phone && (
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tele-Comms</p>
                          <p className="text-[12px] font-black text-slate-900 tracking-widest">{selectedAccount.phone}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Authentication Subsystem */}
                <div className="space-y-8">
                  <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
                    <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-8 flex items-center gap-2">
                      <Key className="h-4 w-4 text-primary-600" /> Access Credentials
                    </h3>
                    <div className="space-y-8">
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3">Identity Key (USERNAME)</p>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                          <span className="text-[12px] font-black text-slate-900 uppercase tracking-widest">{selectedAccount.username}</span>
                          <button onClick={() => navigator.clipboard.writeText(selectedAccount.username)} className="text-primary-600 text-[9px] font-black uppercase tracking-widest">Copy Username</button>
                        </div>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3">Pass-Sequence (DECRYPTED)</p>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                          <span className="text-[12px] font-black text-slate-900 tracking-widest">
                            {showPassword ? selectedAccount.password : '••••••••••••'}
                          </span>
                          <div className="flex items-center gap-4">
                            <button onClick={() => setShowPassword(!showPassword)} className="text-slate-400 hover:text-primary-600">
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                            {showPassword && (
                              <button onClick={() => navigator.clipboard.writeText(selectedAccount.password)} className="text-primary-600 text-[9px] font-black uppercase tracking-widest">Copy Password</button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedAccount.address && (
                    <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
                      <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary-600" /> Geographical Node
                      </h3>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[11px] font-medium text-slate-600 leading-relaxed uppercase tracking-tight">
                          {selectedAccount.address.street}, {selectedAccount.address.city}, <br />
                          {selectedAccount.address.state} {selectedAccount.address.zipCode} <br />
                          {selectedAccount.address.country}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 relative z-10">
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="w-full py-4 bg-slate-900 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary-600 transition-all shadow-xl"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountManagement;
