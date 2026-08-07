import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { 
    Users, Plus, Edit2, Trash2, Power, Key, X, Check,
    ShoppingCart, Package, Calendar, ChevronDown, Search,
    Shield, Clock, AlertCircle, RefreshCw, Lock, Truck,
    Home, Activity, Layers, Star, MessageSquare, Heart, Eye, Wallet
} from 'lucide-react';
import PermissionsManager from '../../components/admin/PermissionsManager';
import { staffService } from '../../services/apiService';

const STAFF_TYPES = [
    // Service Professionals
    { id: 'veterinarian', label: 'Veterinarian', icon: Shield, color: 'emerald', category: 'prof', description: 'Medical professional' },
    { id: 'groomer', label: 'Groomer', icon: Heart, color: 'pink', category: 'prof', description: 'Styling professional' },
    { id: 'trainer', label: 'Trainer', icon: Activity, color: 'blue', category: 'prof', description: 'Behavior specialist' },
    { id: 'boarding_specialist', label: 'Boarding', icon: Home, color: 'purple', category: 'prof', description: 'Facility specialist' },
    { id: 'medical_assistant', label: 'Med Asst.', icon: Shield, color: 'cyan', category: 'prof', description: 'Clinical support' },
    { id: 'pet_handler', label: 'Handler', icon: Users, color: 'indigo', category: 'prof', description: 'Safety professional' },
    
    // Operational Staff
    { id: 'inventory_staff', label: 'Inventory', icon: Package, color: 'amber', category: 'ops', description: 'Stock & Suppliers' },
    { id: 'logistics_staff', label: 'Logistics', icon: Truck, color: 'rose', category: 'ops', description: 'Fulfillment & Delivery' },
    { id: 'sales_staff', label: 'Sales', icon: ShoppingCart, color: 'teal', category: 'ops', description: 'Orders & Customers' },
    { id: 'service_management_staff', label: 'Svc Mgmt', icon: Calendar, color: 'violet', category: 'ops', description: 'Services & Listings' },
    { id: 'administrative_support', label: 'Admin', icon: Layers, color: 'slate', category: 'ops', description: 'Back-office support' }
    ,{ id: 'delivery_rider', label: 'Delivery Rider', icon: Truck, color: 'orange', category: 'ops', description: 'Assigned parcel delivery' }
];

const TYPE_STYLES = {
    veterinarian: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    groomer: 'bg-pink-50 text-pink-700 border-pink-200',
    trainer: 'bg-blue-50 text-blue-700 border-blue-200',
    boarding_specialist: 'bg-purple-50 text-purple-700 border-purple-200',
    medical_assistant: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    pet_handler: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    inventory_staff: 'bg-amber-50 text-amber-700 border-amber-200',
    logistics_staff: 'bg-rose-50 text-rose-700 border-rose-200',
    sales_staff: 'bg-teal-50 text-teal-700 border-teal-200',
    service_management_staff: 'bg-violet-50 text-violet-700 border-violet-200',
    administrative_support: 'bg-slate-50 text-slate-700 border-slate-200',
    delivery_rider: 'bg-orange-50 text-orange-700 border-orange-200',
    // Fallbacks
    order_staff: 'bg-blue-50 text-blue-700 border-blue-200',
    service_staff: 'bg-purple-50 text-purple-700 border-purple-200'
};

const defaultForm = {
    firstName: '', lastName: '', email: '', username: '',
    staffType: 'order_staff', phone: '', permissions: {},
    riderProfile: {
        staffId: '', accountStatus: 'active', vehicleType: '', plateNumber: '', licenseId: '', deliveryZone: '',
        earningRules: { baseRate: 0, incentive: 0, bonus: 0, deduction: 0 },
        payoutMethod: { type: '', accountName: '', accountNumber: '', bankName: '' }
    }
};

const StaffManagement = () => {
    const { user } = useAuth();
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterBranch, setFilterBranch] = useState('');

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [editingStaff, setEditingStaff] = useState(null);
    const [form, setForm] = useState(defaultForm);
    const [submitting, setSubmitting] = useState(false);

    const [resetting, setResetting] = useState(false);
    const [resetTarget, setResetTarget] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [riderDetails, setRiderDetails] = useState(null);
    const [loadingRider, setLoadingRider] = useState(false);
    
    // Modal tabs
    const [activeTab, setActiveTab] = useState('info'); // 'info' or 'permissions'

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
        setActiveTab('info');
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
            phone: member.phone || '',
            permissions: member.permissions || {},
            riderProfile: { ...defaultForm.riderProfile, ...(member.riderProfile || {}), earningRules: { ...defaultForm.riderProfile.earningRules, ...(member.riderProfile?.earningRules || {}) }, payoutMethod: { ...defaultForm.riderProfile.payoutMethod, ...(member.riderProfile?.payoutMethod || {}) } }
        });
        setActiveTab('info');
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (editingStaff) {
                if (form.staffType === 'delivery_rider' && form.riderProfile.accountStatus !== editingStaff.riderProfile?.accountStatus && !window.confirm(`Change rider status to ${form.riderProfile.accountStatus}? New assignment eligibility will update, while delivery and payout history remains unchanged.`)) {
                    setSubmitting(false);
                    return;
                }
                await staffService.update(editingStaff._id, {
                    firstName: form.firstName,
                    lastName: form.lastName,
                    phone: form.phone,
                    staffType: form.staffType,
                    permissions: form.permissions,
                    riderProfile: form.staffType === 'delivery_rider' ? form.riderProfile : undefined
                });
                toast.success('Staff updated successfully');
            } else {
                // Inject targetstoreId from current user
                const payload = { 
                    ...form, 
                    targetStoreId: user.store?._id || user.store 
                };
                
                if (!payload.targetStoreId) {
                    toast.error('Store identity missing. Please re-login.');
                    setSubmitting(false);
                    return;
                }

                if (form.staffType === 'delivery_rider' && !window.confirm(`Create Delivery Rider?\n\nName: ${form.firstName} ${form.lastName}\nStaff ID: ${form.riderProfile.staffId}\nBranch: Assigned Store\nPayout Method: ${form.riderProfile.payoutMethod.type || 'Not configured'}\nStatus: ${form.riderProfile.accountStatus}`)) {
                    setSubmitting(false);
                    return;
                }

                const res = await staffService.create(payload);
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
        const member = staff.find(item => item._id === id);
        if (!window.confirm(`${member?.isActive ? 'Deactivate' : 'Activate'} ${member?.firstName || 'this staff member'}? Existing delivery, earning, and payout history will be preserved.`)) return;
        try {
            const res = await staffService.toggleStatus(id);
            toast.success(res.data.message);
            fetchStaff();
        } catch {
            toast.error('Failed to toggle status');
        }
    };

    const openRiderDetails = async (member) => {
        setLoadingRider(true);
        try { const response = await staffService.getRiderDetails(member._id); setRiderDetails(response.data); }
        catch (error) { toast.error(error.response?.data?.message || 'Unable to load rider details'); }
        finally { setLoadingRider(false); }
    };

    const requestRiderPayout = async () => {
        if (!window.confirm('Create a payout from all available rider earnings?')) return;
        try { await staffService.createRiderPayout(riderDetails.rider._id); toast.success('Rider payout created'); await openRiderDetails(riderDetails.rider); }
        catch (error) { toast.error(error.response?.data?.message || 'Unable to create payout'); }
    };
    const updateRiderPayout = async (payout, status) => {
        const referenceNumber = status === 'paid' ? window.prompt('Enter the payout reference number:') : '';
        if (status === 'paid' && !referenceNumber) return;
        if (!window.confirm(`Mark payout ${payout.payoutId} as ${status}?`)) return;
        try { await staffService.updateRiderPayout(payout._id, { status, referenceNumber }); toast.success(`Payout marked ${status}`); await openRiderDetails(riderDetails.rider); }
        catch (error) { toast.error(error.response?.data?.message || 'Unable to update payout'); }
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
            `${s.firstName} ${s.lastName} ${s.email} ${s.username} ${s.riderProfile?.staffId || ''} ${s.store?.name || ''}`.toLowerCase().includes(searchQuery.toLowerCase());
        const matchType = !filterType || s.staffType === filterType;
        const currentStatus = s.staffType === 'delivery_rider' ? s.riderProfile?.accountStatus : (s.isActive ? 'active' : 'inactive');
        const matchStatus = !filterStatus || currentStatus === filterStatus;
        const matchBranch = !filterBranch || (s.store?._id || s.store) === filterBranch;
        return matchSearch && matchType && matchStatus && matchBranch;
    });

    const counts = {
        total: staff.length,
        active: staff.filter(s => s.isActive).length,
        prof: staff.filter(s => STAFF_TYPES.find(t => t.id === s.staffType)?.category === 'prof').length,
        ops: staff.filter(s => STAFF_TYPES.find(t => t.id === s.staffType)?.category === 'ops').length
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
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                    {[
                        { label: 'Total Staff', value: counts.total, color: 'slate' },
                        { label: 'Active', value: counts.active, color: 'emerald' },
                        { label: 'Professional', value: counts.prof, color: 'primary' },
                        { label: 'Operational', value: counts.ops, color: 'indigo' }
                    ].map(s => (
                        <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm text-center">
                            <p className={`text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1`}>{s.label}</p>
                            <p className="text-2xl font-black text-slate-900">{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* Staff Type Cards - Compact Horizontal Layout */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    {STAFF_TYPES.map(t => {
                        const Icon = t.icon;
                        const isActive = filterType === t.id;
                        return (
                            <div
                                key={t.id}
                                onClick={() => setFilterType(isActive ? '' : t.id)}
                                className={`flex items-center gap-3 bg-white rounded-2xl border p-3 cursor-pointer transition-all shadow-sm hover:shadow-md ${isActive ? 'border-primary-600 ring-4 ring-primary-50' : 'border-slate-100 hover:border-slate-200'}`}
                            >
                                <div className={`shrink-0 p-2 rounded-xl bg-${t.color}-50`}>
                                    <Icon className={`h-4 w-4 text-${t.color}-600`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="font-black text-slate-900 text-[11px] leading-none mb-1">{t.label}</h3>
                                    <p className="text-slate-400 text-[9px] font-bold uppercase tracking-tight truncate leading-none">{t.description}</p>
                                </div>
                                {isActive && <Check className="h-3.5 w-3.5 text-primary-600 shrink-0" />}
                            </div>
                        );
                    })}
                </div>

                <div className="bg-slate-900 p-2 rounded-[2rem] shadow-xl border border-slate-800 mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                        <div className="md:col-span-4 relative group">
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                                <Search className="h-4 w-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" />
                            </div>
                            <input
                                type="text" 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="SEARCH STAFF MEMBERS..."
                                className="w-full pl-16 pr-4 py-4 bg-slate-800 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/20 transition-all placeholder:text-slate-600 font-sans"
                            />
                        </div>
                        <div className="md:col-span-3 relative group">
                            <div className="absolute left-6 top-1/2 -translate-y-1/2">
                                <Shield className="h-4 w-4 text-primary-500" />
                            </div>
                            <select
                                value={filterType} 
                                onChange={(e) => setFilterType(e.target.value)}
                                className="w-full pl-16 pr-10 py-4 bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl outline-none focus:ring-2 focus:ring-primary-500/20 appearance-none transition-all cursor-pointer font-sans"
                            >
                                <option value="" className="bg-slate-900 text-white font-black">ALL ROLES: VIEW ALL</option>
                                <optgroup label="SERVICE PROFESSIONALS" className="bg-slate-900 text-primary-500 font-black">
                                    {STAFF_TYPES.filter(t => t.category === 'prof').map(t => (
                                        <option key={t.id} value={t.id} className="bg-slate-900 text-white font-black">{t.label.toUpperCase()}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="OPERATIONAL SUPPORT" className="bg-slate-900 text-secondary-500 font-black">
                                    {STAFF_TYPES.filter(t => t.category === 'ops').map(t => (
                                        <option key={t.id} value={t.id} className="bg-slate-900 text-white font-black">{t.label.toUpperCase()}</option>
                                    ))}
                                </optgroup>
                            </select>
                            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                        </div>
                        <div className="md:col-span-2"><select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="w-full h-full min-h-12 px-3 bg-slate-800 text-white text-[10px] font-black uppercase rounded-2xl"><option value="">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></div>
                        <div className="md:col-span-3"><select value={filterBranch} onChange={e=>setFilterBranch(e.target.value)} className="w-full h-full min-h-12 px-3 bg-slate-800 text-white text-[10px] font-black uppercase rounded-2xl"><option value="">All Branches</option>{Array.from(new Map(staff.filter(s=>s.store).map(s=>[s.store._id||s.store,s.store.name||'Assigned Store'])).entries()).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></div>
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
                    <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
                        {/* Desktop Table View (Hidden on Mobile) */}
                        <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-50 bg-slate-50/30">
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Staff Member</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hidden lg:table-cell">Contact Info</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</th>
                                        <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hidden md:table-cell">Status</th>
                                        <th className="text-right px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filtered.map(member => {
                                        const typeInfo = STAFF_TYPES.find(t => t.id === member.staffType);
                                        const Icon = typeInfo?.icon || Shield;
                                        return (
                                            <tr key={member._id} className={`hover:bg-slate-50/50 transition-colors ${!member.isActive ? 'opacity-60' : ''}`}>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-500 text-xs shrink-0 border border-slate-200">
                                                            {member.firstName[0]}{member.lastName[0]}
                                                        </div>
                                                        <div>
                                                            <p className="font-black text-slate-900 text-[13px] leading-tight">{member.firstName} {member.lastName}</p>
                                                            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tighter">@{member.username}</p>
                                                            <p className="text-slate-400 text-[9px]">{member.riderProfile?.staffId || member.store?.name} · {new Date(member.createdAt).toLocaleDateString()}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 hidden lg:table-cell">
                                                    <p className="text-slate-600 text-xs font-medium">{member.email}</p>
                                                    {member.phone && <p className="text-slate-400 text-[10px]">{member.phone}</p>}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-xl border text-[9px] font-black uppercase tracking-widest ${TYPE_STYLES[member.staffType]}`}>
                                                        <Icon className="h-3.5 w-3.5" />
                                                        {typeInfo?.label}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 hidden md:table-cell">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${member.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${member.isActive ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                                                            {member.staffType === 'delivery_rider' ? member.riderProfile?.accountStatus : (member.isActive ? 'Active' : 'Offline')}
                                                        </span>
                                                        {member.isActive && member.lastSeen && (new Date() - new Date(member.lastSeen)) < 5 * 60 * 1000 && (
                                                            <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest ml-1 animate-pulse">Live Now</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button onClick={() => openEdit(member)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-all"><Edit2 className="h-4 w-4" /></button>
                                                        {member.staffType === 'delivery_rider' && <button onClick={() => openRiderDetails(member)} disabled={loadingRider} title="View rider earnings and delivery history" className="p-2 rounded-xl text-slate-400 hover:bg-orange-50 hover:text-orange-600 transition-all"><Eye className="h-4 w-4" /></button>}
                                                        <button onClick={() => { setResetTarget(member); setNewPassword(''); }} className="p-2 rounded-xl text-slate-400 hover:bg-secondary-50 hover:text-primary-600 transition-all"><Key className="h-4 w-4" /></button>
                                                        <button onClick={() => handleToggle(member._id)} className={`p-2 rounded-xl transition-all ${member.isActive ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600' : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'}`}><Power className="h-4 w-4" /></button>
                                                        <button onClick={() => handleDelete(member._id, `${member.firstName} ${member.lastName}`)} className="p-2 rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all"><Trash2 className="h-4 w-4" /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card View (Compact List) */}
                        <div className="sm:hidden divide-y divide-slate-100">
                            {filtered.map(member => {
                                const typeInfo = STAFF_TYPES.find(t => t.id === member.staffType);
                                const Icon = typeInfo?.icon || Shield;
                                return (
                                    <div key={member._id} className={`p-3 flex items-center justify-between gap-3 ${!member.isActive ? 'opacity-60' : ''}`}>
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-500 text-[10px] shrink-0 border border-slate-200">
                                                {member.firstName[0]}{member.lastName[0]}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-black text-slate-900 text-[12px] truncate leading-tight">{member.firstName} {member.lastName}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className={`text-[8px] font-black uppercase tracking-tighter ${member.isActive ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                        {member.isActive ? 'ACTIVE' : 'OFFLINE'}
                                                    </span>
                                                    <span className="text-slate-300">/</span>
                                                    <span className={`text-[8px] font-black uppercase tracking-tighter ${TYPE_STYLES[member.staffType].split(' ')[1].replace('700', '600')}`}>
                                                        {typeInfo?.label.split(' ')[0]}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button onClick={() => openEdit(member)} className="p-2 bg-slate-50 text-slate-400 rounded-lg"><Edit2 className="h-3 w-3" /></button>
                                            {member.staffType === 'delivery_rider' && <button onClick={() => openRiderDetails(member)} className="p-2 bg-orange-50 text-orange-500 rounded-lg"><Eye className="h-3 w-3" /></button>}
                                            <button onClick={() => handleToggle(member._id)} className={`p-2 rounded-lg ${member.isActive ? 'bg-rose-50 text-rose-400' : 'bg-emerald-50 text-emerald-400'}`}><Power className="h-3 w-3" /></button>
                                            <button onClick={() => handleDelete(member._id, `${member.firstName} ${member.lastName}`)} className="p-2 bg-rose-50 text-rose-400 rounded-lg"><Trash2 className="h-3 w-3" /></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Create / Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                        <div className="flex items-center justify-between p-7 border-b border-slate-50 bg-slate-50/30">
                            <div>
                                <h2 className="font-black text-slate-900 uppercase tracking-tighter text-xl">
                                    {editingStaff ? 'Edit' : 'New'} <span className="text-primary-600 italic">Staff Member</span>
                                </h2>
                                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.15em] mt-0.5">
                                    {editingStaff ? 'Update profile and access matrix' : 'Hiring and Onboarding System'}
                                </p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2.5 rounded-2xl hover:bg-slate-100 transition-all text-slate-400">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Modal Tabs */}
                        <div className="flex px-7 pt-4 gap-6 border-b border-slate-50">
                            {[
                                { id: 'info', label: 'General Information', icon: Users },
                                { id: 'permissions', label: 'Access Matrix', icon: Lock }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 pb-4 text-[10px] font-black uppercase tracking-widest transition-all relative ${activeTab === tab.id ? 'text-primary-600' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <tab.icon className="h-3.5 w-3.5" />
                                    {tab.label}
                                    {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary-600 rounded-t-full" />}
                                </button>
                            ))}
                        </div>

                        <form onSubmit={handleSubmit} className="p-7">
                            {activeTab === 'info' ? (
                                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 scrollbar-hide">
                                    {/* Staff Type Selector */}
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Professional Specialization *</label>
                                        
                                        <div className="space-y-6">
                                            <div>
                                                <p className="text-[9px] font-black text-primary-600 uppercase mb-3 px-1">Service Professionals</p>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    {STAFF_TYPES.filter(t => t.category === 'prof').map(t => {
                                                        const Icon = t.icon;
                                                        return (
                                                            <button
                                                                key={t.id}
                                                                type="button"
                                                                onClick={() => setForm(f => ({ ...f, staffType: t.id }))}
                                                                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${form.staffType === t.id ? 'bg-primary-600 border-primary-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'}`}
                                                            >
                                                                <Icon className="h-5 w-5" />
                                                                <span className="text-[9px] font-black uppercase tracking-[0.1em] text-center leading-tight">{t.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div>
                                                <p className="text-[9px] font-black text-slate-900 uppercase mb-3 px-1">Operational Support</p>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    {STAFF_TYPES.filter(t => t.category === 'ops').map(t => {
                                                        const Icon = t.icon;
                                                        return (
                                                            <button
                                                                key={t.id}
                                                                type="button"
                                                                onClick={() => setForm(f => ({ ...f, staffType: t.id }))}
                                                                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${form.staffType === t.id ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'}`}
                                                            >
                                                                <Icon className="h-5 w-5" />
                                                                <span className="text-[9px] font-black uppercase tracking-[0.1em] text-center leading-tight">{t.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-5 p-4 bg-primary-50 rounded-2xl border border-primary-100">
                                            <p className="text-primary-700 text-[10px] font-bold uppercase tracking-wide leading-relaxed">
                                                <span className="font-black">Mission Scope:</span> {STAFF_TYPES.find(t => t.id === form.staffType)?.description}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Name fields */}
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            { field: 'firstName', label: 'First Name', required: true, placeholder: 'e.g. Juan' },
                                            { field: 'lastName', label: 'Last Name', required: true, placeholder: 'e.g. Dela Cruz' }
                                        ].map(f => (
                                            <div key={f.field}>
                                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{f.label} *</label>
                                                <input
                                                    type="text"
                                                    value={form[f.field]}
                                                    onChange={e => setForm(prev => ({ ...prev, [f.field]: e.target.value }))}
                                                    placeholder={f.placeholder}
                                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary-500 transition-all placeholder:text-slate-300"
                                                    required={f.required}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    {/* Contact fields */}
                                    {!editingStaff && (
                                        <>
                                            <div className="bg-primary-50 rounded-2xl p-4 border border-primary-100 flex items-start gap-4">
                                                <div className="p-2 bg-white rounded-xl shadow-sm">
                                                    <Key className="h-4 w-4 text-primary-600" />
                                                </div>
                                                <p className="text-[10px] font-black text-primary-700 leading-relaxed uppercase tracking-widest">
                                                    Automated Credentials: <span className="text-slate-900">A secure token will be dispatched to the professional email provided below.</span>
                                                </p>
                                            </div>
                                            
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Professional Email *</label>
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
                                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary-500 transition-all placeholder:text-slate-300"
                                                        required
                                                        placeholder="staff@pawzzle.io"
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">System Username</label>
                                                        <input
                                                            type="text"
                                                            value={form.username}
                                                            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary-500 transition-all"
                                                            required
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Mobile Number</label>
                                                        <input
                                                            type="text"
                                                            value={form.phone}
                                                            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                                            placeholder="+63"
                                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary-500 transition-all placeholder:text-slate-300"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {form.staffType === 'delivery_rider' && (
                                        <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4 space-y-4">
                                            <div><p className="text-[10px] font-black uppercase tracking-widest text-orange-700">Delivery Rider Details</p><p className="text-[10px] text-slate-500 mt-1">Only active riders are eligible for new assignments.</p></div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <label className="text-[10px] font-bold text-slate-600">Staff ID *<input required value={form.riderProfile.staffId} onChange={e=>setForm(f=>({...f,riderProfile:{...f.riderProfile,staffId:e.target.value}}))} className="mt-1 w-full h-10 px-3 rounded-xl border bg-white text-xs" placeholder="RDR-001" /></label>
                                                <label className="text-[10px] font-bold text-slate-600">Account Status<select value={form.riderProfile.accountStatus} onChange={e=>setForm(f=>({...f,riderProfile:{...f.riderProfile,accountStatus:e.target.value}}))} className="mt-1 w-full h-10 px-3 rounded-xl border bg-white text-xs"><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></label>
                                                <label className="text-[10px] font-bold text-slate-600">Vehicle Type *<select required value={form.riderProfile.vehicleType} onChange={e=>setForm(f=>({...f,riderProfile:{...f.riderProfile,vehicleType:e.target.value}}))} className="mt-1 w-full h-10 px-3 rounded-xl border bg-white text-xs"><option value="">Select</option><option value="motorcycle">Motorcycle</option><option value="bicycle">Bicycle</option><option value="car">Car</option><option value="van">Van</option><option value="other">Other</option></select></label>
                                                <label className="text-[10px] font-bold text-slate-600">Plate Number {form.riderProfile.vehicleType !== 'bicycle' && '*'}<input required={form.riderProfile.vehicleType !== 'bicycle'} value={form.riderProfile.plateNumber} onChange={e=>setForm(f=>({...f,riderProfile:{...f.riderProfile,plateNumber:e.target.value}}))} className="mt-1 w-full h-10 px-3 rounded-xl border bg-white text-xs" /></label>
                                                <label className="text-[10px] font-bold text-slate-600">License / ID<input value={form.riderProfile.licenseId} onChange={e=>setForm(f=>({...f,riderProfile:{...f.riderProfile,licenseId:e.target.value}}))} className="mt-1 w-full h-10 px-3 rounded-xl border bg-white text-xs" /></label>
                                                <label className="text-[10px] font-bold text-slate-600">Delivery Zone<input value={form.riderProfile.deliveryZone} onChange={e=>setForm(f=>({...f,riderProfile:{...f.riderProfile,deliveryZone:e.target.value}}))} className="mt-1 w-full h-10 px-3 rounded-xl border bg-white text-xs" /></label>
                                            </div>
                                            <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Earning Configuration</p><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[['baseRate','Base Rate'],['incentive','Incentive'],['bonus','Bonus'],['deduction','Deduction']].map(([key,label])=><label key={key} className="text-[9px] font-bold text-slate-500">{label}<input type="number" min="0" step="0.01" value={form.riderProfile.earningRules[key]} onChange={e=>setForm(f=>({...f,riderProfile:{...f.riderProfile,earningRules:{...f.riderProfile.earningRules,[key]:e.target.value}}}))} className="mt-1 w-full h-10 px-2 rounded-xl border bg-white text-xs" /></label>)}</div><p className="text-[10px] font-bold text-orange-700 mt-2">Calculated earning: ₱{Math.max(0, Number(form.riderProfile.earningRules.baseRate||0)+Number(form.riderProfile.earningRules.incentive||0)+Number(form.riderProfile.earningRules.bonus||0)-Number(form.riderProfile.earningRules.deduction||0)).toFixed(2)}</p></div>
                                            <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Payout Method</p><div className="grid grid-cols-2 gap-2"><select value={form.riderProfile.payoutMethod.type} onChange={e=>setForm(f=>({...f,riderProfile:{...f.riderProfile,payoutMethod:{...f.riderProfile.payoutMethod,type:e.target.value}}}))} className="h-10 px-3 rounded-xl border bg-white text-xs"><option value="">Not configured</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank_transfer">Bank Transfer</option></select><input placeholder="Account name" value={form.riderProfile.payoutMethod.accountName} onChange={e=>setForm(f=>({...f,riderProfile:{...f.riderProfile,payoutMethod:{...f.riderProfile.payoutMethod,accountName:e.target.value}}}))} className="h-10 px-3 rounded-xl border bg-white text-xs" /><input placeholder="Account number" value={form.riderProfile.payoutMethod.accountNumber} onChange={e=>setForm(f=>({...f,riderProfile:{...f.riderProfile,payoutMethod:{...f.riderProfile.payoutMethod,accountNumber:e.target.value}}}))} className="h-10 px-3 rounded-xl border bg-white text-xs" />{form.riderProfile.payoutMethod.type==='bank_transfer'&&<input placeholder="Bank name" value={form.riderProfile.payoutMethod.bankName} onChange={e=>setForm(f=>({...f,riderProfile:{...f.riderProfile,payoutMethod:{...f.riderProfile.payoutMethod,bankName:e.target.value}}}))} className="h-10 px-3 rounded-xl border bg-white text-xs" />}</div></div>
                                        </div>
                                    )}

                                    {/* Edit-only fields */}
                                    {editingStaff && (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Primary Phone</label>
                                                <input
                                                    type="text"
                                                    value={form.phone}
                                                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary-500 transition-all"
                                                />
                                            </div>
                                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                                                <AlertCircle className="h-4 w-4 text-slate-400" />
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Identity Immutable: Email & Username cannot be modified.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                                    <PermissionsManager 
                                        permissions={form.permissions} 
                                        onChange={(p) => setForm(f => ({ ...f, permissions: p }))}
                                        roleName={`${form.firstName || 'Staff'}'s Account`}
                                    />
                                </div>
                            )}

                            <div className="flex gap-4 pt-6 border-t border-slate-50 mt-6">
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-4 bg-slate-900 text-white rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest hover:bg-primary-600 transition-all disabled:opacity-50 shadow-xl flex items-center justify-center gap-3 group"
                                >
                                    {submitting ? (
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Check className="h-4 w-4 group-hover:scale-125 transition-transform" />
                                    )}
                                    {submitting ? 'Processing Session...' : editingStaff ? 'Update Operational Status' : 'Initiate Staff Onboarding'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-8 py-4 bg-white text-slate-400 rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest hover:bg-slate-50 transition-all border-2 border-slate-100"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {riderDetails && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] overflow-y-auto shadow-2xl p-5 space-y-5">
                        <div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-orange-600">Delivery Rider</p><h2 className="text-xl font-black text-slate-900">{riderDetails.rider.firstName} {riderDetails.rider.lastName}</h2><p className="text-xs text-slate-500">{riderDetails.rider.riderProfile?.staffId} · {riderDetails.rider.store?.name} · {riderDetails.rider.riderProfile?.accountStatus}</p></div><button onClick={()=>setRiderDetails(null)} className="p-2 rounded-xl bg-slate-100"><X className="w-4 h-4"/></button></div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[['Assigned',riderDetails.stats.totalAssigned],['Completed',riderDetails.stats.completed],['Failed',riderDetails.stats.failed],['Success Rate',`${riderDetails.stats.successRate}%`]].map(([label,value])=><div key={label} className="p-3 bg-slate-50 rounded-xl"><p className="text-[9px] uppercase font-black text-slate-400">{label}</p><p className="text-lg font-black text-slate-900">{value}</p></div>)}</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[["Today's earnings",riderDetails.earnings.today],['Available payout',riderDetails.earnings.available],['Pending payout',riderDetails.earnings.pending],['Total paid',riderDetails.earnings.totalPaid]].map(([label,value])=><div key={label} className="p-3 border rounded-xl"><p className="text-[9px] uppercase font-black text-slate-400">{label}</p><p className="text-base font-black text-slate-900">₱{Number(value||0).toLocaleString()}</p></div>)}</div>
                        <div className="flex justify-between items-center"><h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Recent deliveries</h3><button onClick={requestRiderPayout} disabled={!riderDetails.earnings.available} className="h-10 px-4 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase disabled:opacity-40 flex items-center gap-2"><Wallet className="w-3.5 h-3.5"/>Create payout</button></div>
                        <div className="border rounded-xl divide-y">{riderDetails.deliveries.length ? riderDetails.deliveries.slice(0,20).map(delivery=><div key={delivery._id} className="p-3 flex justify-between gap-3 text-xs"><div><p className="font-bold text-slate-800">{delivery.order?.orderNumber || delivery.trackingToken}</p><p className="text-slate-500">{delivery.order?.customer?.firstName} {delivery.order?.customer?.lastName}</p></div><div className="text-right"><p className="font-black uppercase text-[10px]">{delivery.status?.replace(/_/g,' ')}</p><p className="text-slate-400">{delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleString() : new Date(delivery.createdAt).toLocaleDateString()}</p></div></div>) : <p className="p-5 text-center text-xs text-slate-400">No delivery history yet.</p>}</div>
                        {riderDetails.payouts.length > 0 && <div><h3 className="text-xs font-black uppercase tracking-widest text-slate-700 mb-2">Payout history</h3><div className="border rounded-xl divide-y">{riderDetails.payouts.map(payout=><div key={payout._id} className="p-3 flex flex-wrap justify-between items-center gap-2 text-xs"><span>{payout.payoutId} · {payout.status}{payout.referenceNumber ? ` · ${payout.referenceNumber}` : ''}</span><div className="flex items-center gap-2"><b>₱{payout.amount.toLocaleString()}</b>{payout.status==='pending'&&<button onClick={()=>updateRiderPayout(payout,'processing')} className="px-2 py-1 rounded bg-blue-50 text-blue-700 font-bold">Process</button>}{payout.status==='processing'&&<><button onClick={()=>updateRiderPayout(payout,'paid')} className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 font-bold">Paid</button><button onClick={()=>updateRiderPayout(payout,'failed')} className="px-2 py-1 rounded bg-rose-50 text-rose-700 font-bold">Failed</button></>}</div></div>)}</div></div>}
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

                        <div className="bg-secondary-50 border border-secondary-200 rounded-2xl p-3 flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-secondary-500 shrink-0 mt-0.5" />
                            <p className="text-primary-700 text-xs">Share the new password with the staff member securely. They can change it after logging in.</p>
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
                                className="flex-1 py-3.5 bg-secondary-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-600 transition-all disabled:opacity-50"
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
