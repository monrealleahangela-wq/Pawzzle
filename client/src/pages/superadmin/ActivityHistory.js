import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import { userService, petService, productService, orderService } from '../../services/apiService';
import {
    Users,
    Heart,
    Package,
    ShoppingCart,
    Zap,
    Shield,
    Search,
    ArrowLeft,
    Calendar,
    Filter,
    RefreshCw
} from 'lucide-react';

const ActivityHistory = () => {
    const [data, setData] = useState({
        users: [],
        pets: [],
        products: [],
        orders: []
    });
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');

    const fetchAllData = useCallback(async () => {
        try {
            setLoading(true);
            const [usersResponse, petsResponse, productsResponse, ordersResponse] = await Promise.all([
                userService.getAllUsers({ limit: 1000 }),
                petService.getAllPets({ limit: 1000 }),
                productService.getAllProducts({ limit: 1000 }),
                orderService.getAllOrders({ limit: 1000 })
            ]);

            setData({
                users: usersResponse.data.users || [],
                pets: petsResponse.data.pets || [],
                products: productsResponse.data.products || [],
                orders: ordersResponse.data.orders || []
            });
        } catch (error) {
            toast.error('Failed to load system activity');
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    const allActivities = useMemo(() => {
        const activities = [
            ...data.users.map(u => ({
                id: u._id,
                type: 'user',
                label: 'User Registered',
                detail: `${u.firstName} ${u.lastName} (${u.email})`,
                role: u.role,
                date: u.createdAt,
                color: 'indigo'
            })),
            ...data.pets.map(p => ({
                id: p._id,
                type: 'pet',
                label: 'New Pet Listed',
                detail: `${p.name} - ${p.breed}`,
                store: p.storeDisplay?.name || 'Unknown Store',
                date: p.createdAt,
                color: 'rose'
            })),
            ...data.orders.map(o => ({
                id: o._id,
                type: 'order',
                label: 'New Order Placed',
                detail: `Order #${o.orderNumber.slice(-8).toUpperCase()} - ₱${o.totalAmount.toLocaleString()}`,
                customer: o.customer?.firstName || 'Unknown',
                date: o.createdAt,
                color: 'emerald'
            }))
        ];

        return activities.sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [data]);

    const filteredActivities = useMemo(() => {
        return allActivities.filter(activity => {
            const matchesSearch = activity.detail.toLowerCase().includes(searchTerm.toLowerCase()) ||
                activity.label.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesFilter = filterType === 'all' || activity.type === filterType;
            return matchesSearch && matchesFilter;
        });
    }, [allActivities, searchTerm, filterType]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-6 bg-slate-50/50">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
                    <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-indigo-600 animate-pulse" />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Compiling Activity Log...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50/30 p-4 lg:p-8 space-y-8 pb-32">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-slate-100 pb-8">
                <div>
                    <Link to="/superadmin/system-analytics" className="inline-flex items-center text-[10px] font-black text-slate-400 hover:text-indigo-600 uppercase tracking-[0.2em] mb-4 transition-colors">
                        <ArrowLeft className="h-3 w-3 mr-2" />
                        Back to Analytics
                    </Link>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg">
                            <Zap className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em]">Audit Protocol</span>
                    </div>
                    <h1 className="text-4xl sm:text-6xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">
                        Activity <span className="text-indigo-600 italic">History</span>
                    </h1>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">Complete immutable platform event log</p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <button onClick={fetchAllData} className="p-4 bg-white border border-slate-100 text-slate-400 rounded-2xl hover:text-indigo-600 hover:border-indigo-100 transition-all active:scale-95 shadow-sm">
                        <RefreshCw className="h-5 w-5" />
                    </button>
                    <div className="px-6 py-4 bg-indigo-600 text-white rounded-2xl flex items-center gap-3 shadow-xl shadow-indigo-100">
                        <Shield className="h-4 w-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">{allActivities.length} Events Total</span>
                    </div>
                </div>
            </div>

            {/* Filters & Search */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-8 relative group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                    <input
                        type="text"
                        placeholder="Search activities, users, or events..."
                        className="w-full !pl-20 pr-6 py-5 bg-white border border-slate-100 rounded-[2rem] text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-200 transition-all shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="lg:col-span-4 flex gap-2">
                    {['all', 'user', 'pet', 'order'].map(type => (
                        <button
                            key={type}
                            onClick={() => setFilterType(type)}
                            className={`flex-1 px-4 py-5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${filterType === type
                                    ? 'bg-slate-900 text-white shadow-xl translate-y-[-2px]'
                                    : 'bg-white border border-slate-100 text-slate-400 hover:bg-slate-50'
                                }`}
                        >
                            {type === 'all' ? 'All' : type + 's'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Activity List */}
            <div className="bg-white border border-slate-100 rounded-[3rem] overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Event Type</th>
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Details</th>
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Timestamp</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredActivities.length > 0 ? filteredActivities.map((activity, i) => (
                                <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-8 py-8">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-2xl bg-${activity.color}-50 text-${activity.color}-600 flex items-center justify-center border border-${activity.color}-100 group-hover:scale-110 transition-transform`}>
                                                {activity.type === 'user' ? <Users className="h-5 w-5" /> :
                                                    activity.type === 'pet' ? <Heart className="h-5 w-5" /> :
                                                        <ShoppingCart className="h-5 w-5" />}
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{activity.label}</p>
                                                <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-${activity.color}-50 text-${activity.color}-600`}>
                                                    {activity.type}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-8">
                                        <div className="space-y-1">
                                            <p className="text-sm font-black text-slate-800 tracking-tight">{activity.detail}</p>
                                            <div className="flex items-center gap-3">
                                                {activity.type === 'user' && (
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">{activity.role}</span>
                                                )}
                                                {activity.type === 'pet' && (
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">{activity.store}</span>
                                                )}
                                                {activity.type === 'order' && (
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">customer: {activity.customer}</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-8 text-right">
                                        <div className="flex flex-col items-end">
                                            <div className="flex items-center gap-2 text-slate-900 font-black text-sm tracking-tighter">
                                                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                                {new Date(activity.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                                {new Date(activity.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="3" className="px-8 py-32 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                                                <Filter className="h-8 w-8" />
                                            </div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">No events found matching your criteria</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ActivityHistory;
