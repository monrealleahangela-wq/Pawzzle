import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { userService } from '../../services/apiService';
import { Users, Trash2, Shield, User, Globe, Activity, Filter, ChevronLeft, ChevronRight, CheckCircle, XCircle, ShieldAlert } from 'lucide-react';
import ReportModal from '../../components/ReportModal';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    role: '',
    isActive: ''
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
  });
  const [reportModal, setReportModal] = useState({
    isOpen: false,
    user: null
  });

  useEffect(() => {
    fetchUsers();
  }, [filters, pagination.currentPage]);

  const fetchUsers = async () => {
    try {
      const params = {
        ...filters,
        page: pagination.currentPage,
        limit: 15
      };

      const response = await userService.getAllUsers(params);
      setUsers(response.data.users || []);
      setPagination(response.data.pagination || pagination);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  const handleToggleStatus = async (userId) => {
    try {
      await userService.toggleUserStatus(userId);
      toast.success('User status updated');
      fetchUsers();
    } catch (error) {
      toast.error('Failed to update user status');
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (window.confirm(`Delete user "${userName}"? This cannot be undone.`)) {
      try {
        await userService.deleteUser(userId);
        toast.success('User deleted successfully');
        fetchUsers();
      } catch (error) {
        toast.error('Failed to delete user');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 gap-4">
        <div className="w-12 h-1 bg-slate-100 overflow-hidden rounded-full">
          <div className="w-1/2 h-full bg-primary-600 animate-[loading_1s_infinite_ease-in-out]"></div>
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Loading Users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-slate-100 pb-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
            User <br />
            <span className="text-primary-600 italic">Management</span>
          </h1>
          <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">Manage user accounts and permissions</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
          <div className="relative group min-w-[120px]">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            <select
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-black uppercase tracking-tight appearance-none cursor-pointer outline-none focus:border-primary-500 transition-all"
              value={filters.role}
              onChange={(e) => handleFilterChange('role', e.target.value)}
            >
              <option value="">ST: ALL ROLES</option>
              <option value="super_admin">ST: SUPER ADMIN</option>
              <option value="admin">ST: ADMIN</option>
              <option value="customer">ST: CUSTOMER</option>
            </select>
          </div>

          <div className="relative group min-w-[120px]">
            <Activity className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            <select
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-black uppercase tracking-tight appearance-none cursor-pointer outline-none focus:border-primary-500 transition-all"
              value={filters.isActive}
              onChange={(e) => handleFilterChange('isActive', e.target.value)}
            >
              <option value="">ST: ALL STATUS</option>
              <option value="true">ST: ACTIVE ONLY</option>
              <option value="false">ST: INACTIVE</option>
            </select>
          </div>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-[2.5rem] border border-dashed border-slate-200">
          <Users className="h-10 w-10 text-slate-200 mb-4" />
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">No users found</h2>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-1.5">
          {/* List Header - Desktop Only */}
          <div className="hidden lg:grid grid-cols-12 gap-4 px-6 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <div className="col-span-4">User</div>
            <div className="col-span-2 text-center">Role</div>
            <div className="col-span-2 text-center">Status</div>
            <div className="col-span-3">Contact</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          <div className="space-y-1.5">
            {users.map((user) => (
              <div key={user._id} className="group bg-white hover:bg-slate-50 border border-slate-100 rounded-xl sm:rounded-3xl p-3 sm:p-4 transition-all duration-300">
                <div className="grid grid-cols-1 lg:grid-cols-12 items-center gap-3 sm:gap-4">
                  {/* User */}
                  <div className="lg:col-span-4 flex items-center gap-3">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center border transition-colors ${user.role === 'super_admin' ? 'bg-slate-900 border-slate-900 text-white' :
                      user.role === 'admin' ? 'bg-primary-50 border-primary-100 text-primary-600' :
                        'bg-slate-50 border-slate-100 text-slate-400'
                      }`}>
                      {user.role === 'super_admin' ? <Shield className="h-4 w-4 sm:h-5 sm:w-5" /> : <User className="h-4 w-4 sm:h-5 sm:w-5" />}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-[11px] sm:text-sm font-black text-slate-900 uppercase tracking-tight leading-none mb-1">
                        {user.firstName} {user.lastName}
                      </h4>
                      <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none truncate opacity-60">@{user.username}</p>
                    </div>
                  </div>

                  {/* Role */}
                  <div className="lg:col-span-2 flex lg:justify-center">
                    <span className={`px-2 py-0.5 rounded text-[8px] sm:text-[10px] font-black uppercase tracking-widest border ${user.role === 'super_admin' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                      user.role === 'admin' ? 'border-primary-100 bg-primary-50 text-primary-600' :
                        'border-slate-100 bg-slate-50 text-slate-500'
                      }`}>
                      {user.role.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="lg:col-span-2 flex lg:justify-center items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`}></div>
                    <span className={`text-[8px] sm:text-[10px] font-black uppercase tracking-widest ${user.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {user.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </div>

                  {/* Contact */}
                  <div className="lg:col-span-3 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] font-black text-slate-500 uppercase tracking-tight italic opacity-70 truncate">
                      <Globe className="h-2.5 w-2.5" /> {user.email}
                    </div>
                    {user.phone && (
                      <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                        <Activity className="h-2.5 w-2.5" /> {user.phone}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="lg:col-span-1 flex justify-end gap-1.5">
                    <button
                      onClick={() => handleToggleStatus(user._id)}
                      className={`p-1.5 sm:p-2 rounded-lg border transition-all ${user.isActive
                        ? 'border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100'
                        : 'border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}
                      title={user.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {user.isActive ? <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user._id, user.username)}
                      className="p-1.5 sm:p-2 rounded-lg border border-slate-100 bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all"
                      title="Delete User"
                    >
                      <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </button>
                    <button
                      onClick={() => setReportModal({ isOpen: true, user: user })}
                      className="p-1.5 sm:p-2 rounded-lg border border-rose-100 bg-white text-rose-500 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all"
                      title="Report User"
                    >
                      <ShieldAlert className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-between items-center bg-slate-50 p-2 rounded-xl sm:rounded-3xl border border-slate-100 mt-6">
              <button
                onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage - 1 }))}
                disabled={!pagination.hasPrev}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-primary-600 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-3">
                <span className="text-[9px] sm:text-xs font-black text-slate-900 uppercase tracking-widest">
                  Page <span className="text-primary-600 italic px-1">{pagination.currentPage}</span> of {pagination.totalPages}
                </span>
                <div className="hidden sm:flex gap-1">
                  {[...Array(pagination.totalPages)].map((_, i) => (
                    <div key={i} className={`w-1 h-1 rounded-full ${i + 1 === pagination.currentPage ? 'bg-primary-600 w-3' : 'bg-slate-300'} transition-all`}></div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage + 1 }))}
                disabled={!pagination.hasNext}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-primary-600 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      )}

      <ReportModal
        isOpen={reportModal.isOpen}
        onClose={() => setReportModal({ isOpen: false, user: null })}
        reportedUser={reportModal.user}
      />
    </div>
  );
};

export default AdminUsers;
