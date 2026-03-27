import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { staffService } from '../../services/apiService';
import {
    Users, Plus, Edit2, Trash2, Power, Key, X, Check,
    ShoppingCart, Package, Calendar, ChevronDown, Search,
    Shield, Clock, AlertCircle, RefreshCw
} from 'lucide-react';

const STAFF_TYPES = [
    {
        id: 'order_staff',
        label: 'Order Processing',
        icon: ShoppingCart,
        color: 'blue',
        description: 'Manages customer orders, confirms pickups, updates order status'
    },
    {
        id: 'inventory_staff',
        label: 'Inventory',
        icon: Package,
        color: 'amber',
        description: 'Manages products, pet listings, and stock levels'
    },
    {
        id: 'service_staff',
        label: 'Service',
        icon: Calendar,
        color: 'purple',
        description: 'Manages grooming/vet bookings and appointment schedules'
    }
];

const TYPE_STYLES = {
    order_staff: 'bg-blue-50 text-blue-700 border-blue-200',
    inventory_staff: 'bg-amber-50 text-amber-700 border-amber-200',
    service_staff: 'bg-purple-50 text-purple-700 border-purple-200'
};

const defaultForm = {
    firstName: '', lastName: '', email: '', username: '',
    staffType: 'order_staff', phone: ''
};

const StaffManagement = () => {
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('');

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [editingStaff, setEditingStaff] = useState(null);
    const [form, setForm] = useState(defaultForm);
    const [submitting, setSubmitting] = useState(false);

    // Password reset modal
    const [resetTarget, setResetTarget] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [resetting, setResetting] = useState(false);

    const fetchStaff = async () => {
        setLoading(true);
        try {
            const res = await staffService.getAll();
            setStaff(res.data.staff);
        } catch {
            toast.error('Failed to load staff');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchStaff(); }, []);

    const openCreate = () => {
        setEditingStaff(null);
        setForm(defaultForm);
        setShowModal(true);
    };

    const openEdit = (member) => {
        setEditingStaff(member);
        setForm({
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.email,
            username: member.username,
            password: '',
            staffType: member.staffType,
            phone: member.phone || ''
        });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (editingStaff) {
                await staffService.update(editingStaff._id, {
                    firstName: form.firstName,
                    lastName: form.lastName,
                    phone: form.phone,
                    staffType: form.staffType
                });
                toast.success('Staff updated successfully');
            } else {
                const res = await staffService.create(form);
                toast.success(res.data.message || 'Staff account created successfully');
            }
            setShowModal(false);
            fetchStaff();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save staff');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggle = async (id) => {
        try {
            const res = await staffService.toggleStatus(id);
            toast.success(res.data.message);
            fetchStaff();
        } catch {
            toast.error('Failed to toggle status');
        }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Remove ${name} from your team? This cannot be undone.`)) return;
        try {
            await staffService.remove(id);
            toast.success('Staff removed');
            fetchStaff();
        } catch {
            toast.error('Failed to remove staff');
        }
    };

    const handleResetPassword = async () => {
        if (!newPassword || newPassword.length < 6) {
            return toast.error('Password must be at least 6 characters');
        }
        setResetting(true);
        try {
            await staffService.resetPassword(resetTarget._id, newPassword);
            toast.success('Password reset successfully');
            setResetTarget(null);
            setNewPassword('');
        } catch {
            toast.error('Failed to reset password');
        } finally {
            setResetting(false);
        }
    };

    const filtered = staff.filter(s => {
        const matchSearch = !searchQuery ||
            `${s.firstName} ${s.lastName} ${s.email} ${s.username}`.toLowerCase().includes(searchQuery.toLowerCase());
        const matchType = !filterType || s.staffType === filterType;
        return matchSearch && matchType;
    });

    const counts = {
        total: staff.length,
        active: staff.filter(s => s.isActive).length,
        order: staff.filter(s => s.staffType === 'order_staff').length,
        inventory: staff.filter(s => s.staffType === 'inventory_staff').length,
        service: staff.filter(s => s.staffType === 'service_staff').length
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
                            Staff <span className="text-primary-600 italic">Management</span>
                        </h1>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-0.5">
                            Manage your store team and access permissions
                        </p>
                    </div>
                    <button
                        onClick={openCreate}
                        className="flex items-center gap-2 px-5 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-600 transition-all shadow-lg"
                    >
                        <Plus className="h-4 w-4" />
                        Add Staff
                    </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {[
                        { label: 'Total Staff', value: counts.total, color: 'slate' },
                        { label: 'Active', value: counts.active, color: 'emerald' },
                        { label: 'Order Staff', value: counts.order, color: 'blue' },
                        { label: 'Inventory', value: counts.inventory, color: 'amber' },
                        { label: 'Service', value: counts.service, color: 'purple' }
                    ].map(s => (
                        <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm text-center">
                            <p className={`text-[9px] font-black uppercase tracking-widest text-${s.color}-600 mb-1`}>{s.label}</p>
                            <p className="text-2xl font-black text-slate-900">{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* Staff Type Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {STAFF_TYPES.map(t => {
                        const Icon = t.icon;
                        return (
                            <div
                                key={t.id}
                                onClick={() => setFilterType(filterType === t.id ? '' : t.id)}
                                className={`bg-white rounded-2xl border p-5 cursor-pointer transition-all shadow-sm hover:shadow-md ${filterType === t.id ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-100'}`}
                            >
                                <div className={`inline-flex p-2.5 rounded-2xl bg-${t.color}-50 mb-3`}>
                                    <Icon className={`h-5 w-5 text-${t.color}-600`} />
                                </div>
                                <h3 className="font-black text-slate-900 text-sm">{t.label} Staff</h3>
                                <p className="text-slate-400 text-xs mt-1 leading-relaxed">{t.description}</p>
                            </div>
                        );
                    })}
                </div>

                {/* Team HUD Filter - High Contrast & Always Visible */}
                <div className="bg-slate-900 p-2 rounded-[1.5rem] shadow-xl border border-slate-800">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                        <div className="md:col-span-6 relative group">
                            <div className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center gap-3">
                                <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
                            </div>
                            <input
                                type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder=""
                                className="w-full pl-14 pr-4 py-3.5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/50 placeholder:text-slate-600 transition-all font-sans"
                            />
                        </div>
                        <div className="md:col-span-4 relative">
                            <div className="absolute left-5 top-1/2 -translate-y-1/2">
                                <Shield className="h-4 w-4 text-primary-500" />
                            </div>
                            <select
                                value={filterType} onChange={(e) => setFilterType(e.target.value)}
                                className="w-full h-full bg-slate-800 border-none text-white text-[10px] font-black uppercase tracking-widest rounded-2xl pl-14 pr-10 py-3.5 outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none transition-all cursor-pointer font-sans"
                            >
                                <option value="" className="bg-slate-900 text-white font-black">ALL ROLES: VIEW ALL</option>
                                {STAFF_TYPES.map(t => (
                                    <option key={t.id} value={t.id} className="bg-slate-900 text-white font-black">{t.label.toUpperCase()}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                        </div>
                    </div>
                </div>

                {/* Staff Table */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
                        <Users className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-slate-400 font-bold text-sm">
                            {staff.length === 0 ? 'No staff added yet. Click "Add Staff" to get started.' : 'No staff match your search.'}
                        </p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-50">
                                        <th className="text-left px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Staff Member</th>
                                        <th className="text-left px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:table-cell">Contact</th>
                                        <th className="text-left px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</th>
                                        <th className="text-left px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:table-cell">Status</th>
                                        <th className="text-right px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filtered.map(member => {
                                        const typeInfo = STAFF_TYPES.find(t => t.id === member.staffType);
                                        const Icon = typeInfo?.icon || Shield;
                                        return (
                                            <tr key={member._id} className={`hover:bg-slate-50/50 transition-colors ${!member.isActive ? 'opacity-50' : ''}`}>
                                                <td className="px-6 py-3.5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-500 text-sm shrink-0">
                                                            {member.firstName[0]}{member.lastName[0]}
                                                        </div>
                                                        <div>
                                                            <p className="font-black text-slate-900 text-sm">{member.firstName} {member.lastName}</p>
                                                            <p className="text-slate-400 text-xs">@{member.username}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3.5 hidden sm:table-cell">
                                                    <p className="text-slate-600 text-xs">{member.email}</p>
                                                    {member.phone && <p className="text-slate-400 text-xs">{member.phone}</p>}
                                                </td>
                                                <td className="px-6 py-3.5">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${TYPE_STYLES[member.staffType]}`}>
                                                        <Icon className="h-3 w-3" />
                                                        {typeInfo?.label || member.staffType}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3.5 hidden sm:table-cell">
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${member.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${member.isActive ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                                                            {member.isActive ? 'Active' : 'Inactive'}
                                                        </span>
                                                        {member.isActive && (
                                                            <div className="flex items-center gap-1.5 pl-1">
                                                                <div className={`w-1 h-1 rounded-full ${member.lastSeen && (new Date() - new Date(member.lastSeen)) < 5 * 60 * 1000 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-slate-300'}`} />
                                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">
                                                                    {member.lastSeen && (new Date() - new Date(member.lastSeen)) < 5 * 60 * 1000 ? 'Online' : 'Offline'}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3.5">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => openEdit(member)}
                                                            title="Edit"
                                                            className="p-2 rounded-2xl text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-all"
                                                        >
                                                            <Edit2 className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => { setResetTarget(member); setNewPassword(''); }}
                                                            title="Reset Password"
                                                            className="p-2 rounded-2xl text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-all"
                                                        >
                                                            <Key className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleToggle(member._id)}
                                                            title={member.isActive ? 'Deactivate' : 'Activate'}
                                                            className={`p-2 rounded-2xl transition-all ${member.isActive ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600' : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'}`}
                                                        >
                                                            <Power className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(member._id, `${member.firstName} ${member.lastName}`)}
                                                            title="Remove"
                                                            className="p-2 rounded-2xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Create / Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-6 border-b border-slate-50">
                            <div>
                                <h2 className="font-black text-slate-900 uppercase tracking-tighter text-lg">
                                    {editingStaff ? 'Edit' : 'New'} <span className="text-primary-600 italic">Staff Member</span>
                                </h2>
                                <p className="text-slate-400 text-xs font-bold mt-0.5">
                                    {editingStaff ? 'Update staff information and role' : 'Create a new staff account for your store'}
                                </p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 rounded-2xl hover:bg-slate-50 transition-all text-slate-400">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {/* Staff Type Selector */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Staff Role *</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {STAFF_TYPES.map(t => {
                                        const Icon = t.icon;
                                        return (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => setForm(f => ({ ...f, staffType: t.id }))}
                                                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${form.staffType === t.id ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'}`}
                                            >
                                                <Icon className="h-4 w-4" />
                                                <span className="text-[9px] font-black uppercase tracking-widest text-center leading-tight">{t.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-slate-400 text-[10px] mt-2 italic">
                                    {STAFF_TYPES.find(t => t.id === form.staffType)?.description}
                                </p>
                            </div>

                            {/* Name fields */}
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { field: 'firstName', label: 'First Name', required: true },
                                    { field: 'lastName', label: 'Last Name', required: true }
                                ].map(f => (
                                    <div key={f.field}>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{f.label} *</label>
                                        <input
                                            type="text"
                                            value={form[f.field]}
                                            onChange={e => setForm(prev => ({ ...prev, [f.field]: e.target.value }))}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-primary-400"
                                            required={f.required}
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* Contact fields */}
                            {!editingStaff && (
                                <>
                                    <div className="bg-primary-50 rounded-2xl p-4 border border-primary-100 flex items-start gap-3 mb-2">
                                        <AlertCircle className="h-4 w-4 text-primary-600 mt-0.5" />
                                        <p className="text-[10px] font-bold text-primary-700 leading-relaxed uppercase tracking-widest">
                                            The system will automatically generate a <span className="underline">secure random password</span> and send it to the staff's email.
                                        </p>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Invitation Email *</label>
                                        <input
                                            type="email"
                                            value={form.email}
                                            onChange={e => {
                                                const email = e.target.value;
                                                setForm(f => ({ 
                                                    ...f, 
                                                    email, 
                                                    username: f.username || email.split('@')[0] 
                                                }));
                                            }}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-primary-400"
                                            required
                                            placeholder="e.g. staff@example.com"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Username (Generated)</label>
                                            <input
                                                type="text"
                                                value={form.username}
                                                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-primary-400"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Phone (Optional)</label>
                                            <input
                                                type="text"
                                                value={form.phone}
                                                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-primary-400"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Edit-only fields */}
                            {editingStaff && (
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Phone</label>
                                    <input
                                        type="text"
                                        value={form.phone}
                                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-primary-400"
                                    />
                                    <p className="text-slate-400 text-[10px] mt-1">Email and username cannot be changed. Use "Reset Password" for password changes.</p>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-600 transition-all disabled:opacity-50"
                                >
                                    {submitting ? 'Saving...' : editingStaff ? 'Save Changes' : 'Create Staff Account'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-6 py-3.5 bg-slate-50 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all border border-slate-100"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {resetTarget && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="font-black text-slate-900 uppercase tracking-tighter">Reset Password</h2>
                                <p className="text-slate-400 text-xs mt-0.5">for {resetTarget.firstName} {resetTarget.lastName}</p>
                            </div>
                            <button onClick={() => setResetTarget(null)} className="p-2 rounded-2xl hover:bg-slate-50 text-slate-400"><X className="h-5 w-5" /></button>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-amber-700 text-xs">Share the new password with the staff member securely. They can change it after logging in.</p>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">New Password</label>
                            <input
                                type="text"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Enter new password (min. 6 chars)"
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-primary-400"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleResetPassword}
                                disabled={resetting}
                                className="flex-1 py-3.5 bg-amber-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-amber-600 transition-all disabled:opacity-50"
                            >
                                {resetting ? 'Resetting...' : 'Reset Password'}
                            </button>
                            <button
                                onClick={() => setResetTarget(null)}
                                className="px-5 py-3.5 bg-slate-50 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all border border-slate-100"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StaffManagement;
