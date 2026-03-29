import React from 'react';
import { 
    Eye, Plus, Edit2, Trash2, Shield, 
    Database, MapPin, Store, Users, 
    Calendar, Package, ShoppingCart, 
    Tag, MessageSquare, PieChart, 
    Check, X, RefreshCw, Save
} from 'lucide-react';

const ACTION_MAP = [
    { key: 'view', label: 'View', icon: Eye },
    { key: 'create', label: 'Create', icon: Plus },
    { key: 'update', label: 'Update', icon: Edit2 },
    { key: 'delete', label: 'Remove', icon: Trash2 },
    { key: 'fullAccess', label: 'Full Access', icon: Shield }
];

const RESOURCE_MAP = [
    { 
        key: 'inventory', 
        label: 'Pet & Product Inventory', 
        description: 'Manage pet listings, stock items, and availability.',
        icon: Package 
    },
    { 
        key: 'orders', 
        label: 'Store Orders', 
        description: 'Process customer purchases, pickups, and shipping.',
        icon: ShoppingCart 
    },
    { 
        key: 'bookings', 
        label: 'Booking Schedules', 
        description: 'Manage grooming, vet, and training appointments.',
        icon: Calendar 
    },
    { 
        key: 'services', 
        label: 'Service Menu', 
        description: 'Define available services, pricing, and durations.',
        icon: Store 
    },
    { 
        key: 'customers', 
        label: 'Customer Relations', 
        description: 'View customer history, profiles, and communications.',
        icon: Users 
    },
    { 
        key: 'staff', 
        label: 'Team Management', 
        description: 'Manage staff accounts, invitations, and permissions.',
        icon: Shield 
    },
    { 
        key: 'vouchers', 
        label: 'Promo & Vouchers', 
        description: 'Create and distribute discounts and promotions.',
        icon: Tag 
    },
    { 
        key: 'analytics', 
        label: 'Store Insights', 
        description: 'View revenue reports, trends, and store performance.',
        icon: PieChart 
    }
];

const PermissionsManager = ({ permissions = {}, onChange, roleName = "Staff member" }) => {
    
    // Toggle a single permission
    const handleToggle = (resource, action) => {
        const current = permissions[resource] || {};
        const isFull = action === 'fullAccess';
        const newValue = !current[action];

        let updatedResource = { ...current, [action]: newValue };

        // If toggling Full Access, toggle everything else to match
        if (isFull) {
            updatedResource = {
                view: newValue,
                create: newValue,
                update: newValue,
                delete: newValue,
                fullAccess: newValue
            };
        } else {
            // If toggling other actions, check if they are all true to set Full Access
            const allOthers = ['view', 'create', 'update', 'delete'].every(k => 
                k === action ? newValue : (current[k] || false)
            );
            updatedResource.fullAccess = allOthers;
            
            // If any action is enabled, "view" should usually be enabled too
            if (newValue && action !== 'view') {
                updatedResource.view = true;
            }
        }

        onChange({
            ...permissions,
            [resource]: updatedResource
        });
    };

    return (
        <div className="bg-[#121110] border border-[#2a2725] rounded-[2rem] overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-8 py-6 border-b border-[#2a2725] flex items-center justify-between bg-gradient-to-r from-[#1a1817] to-[#121110]">
                <div>
                    <h2 className="text-xl font-black text-[#f2ece9] uppercase tracking-tighter flex items-center gap-3">
                        <Shield className="h-5 w-5 text-[#f59e0b]" />
                        Permissions Matrix
                    </h2>
                    <p className="text-[#8c827c] text-[10px] font-bold uppercase tracking-[0.2em] mt-1">
                        Control granular access levels for <span className="text-[#f2ece9] italic">{roleName}</span>
                    </p>
                </div>
                <div className="flex gap-2">
                    <button 
                        type="button"
                        onClick={() => onChange({})}
                        className="p-2.5 rounded-2xl bg-[#1e1c1b] border border-[#2a2725] text-[#8c827c] hover:text-[#f2ece9] transition-all"
                        title="Reset All"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-[#1a1817] border-b border-[#2a2725]">
                            <th className="text-left px-8 py-5 text-[9px] font-black text-[#5c5450] uppercase tracking-widest w-1/3">Resource Name</th>
                            {ACTION_MAP.map(action => (
                                <th key={action.key} className="px-4 py-5 text-center">
                                    <div className="flex flex-col items-center gap-1">
                                        <action.icon className={`h-3.5 w-3.5 ${action.key === 'fullAccess' ? 'text-[#f59e0b]' : 'text-[#8c827c]'}`} />
                                        <span className="text-[9px] font-black text-[#5c5450] uppercase tracking-widest">{action.label}</span>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a2725]">
                        {RESOURCE_MAP.map((resource) => {
                            const resPermissions = permissions[resource.key] || {};
                            return (
                                <tr key={resource.key} className="hover:bg-[#1a1817] transition-colors group">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-2xl bg-[#1e1c1b] border border-[#2a2725] flex items-center justify-center group-hover:border-[#f59e0b]/50 transition-all">
                                                <resource.icon className="h-4.5 w-4.5 text-[#8c827c] group-hover:text-[#f2ece9]" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-[#f2ece9] uppercase tracking-tighter truncate max-w-[180px]">
                                                    {resource.label}
                                                </p>
                                                <p className="text-[#8c827c] text-[9px] italic mt-0.5 line-clamp-1 opacity-60">
                                                    {resource.description}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    
                                    {ACTION_MAP.map(action => (
                                        <td key={action.key} className="px-4 py-5 text-center">
                                            <button
                                                type="button"
                                                onClick={() => handleToggle(resource.key, action.key)}
                                                className={`relative w-8 h-4 rounded-full transition-all duration-300 ${
                                                    resPermissions[action.key] 
                                                        ? (action.key === 'fullAccess' ? 'bg-[#f59e0b]' : 'bg-[#10b981]') 
                                                        : 'bg-[#2a2725]'
                                                }`}
                                            >
                                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-300 ${
                                                    resPermissions[action.key] ? 'translate-x-4 shadow-[0_0_8px_rgba(255,255,255,0.4)]' : 'translate-x-0'
                                                }`} />
                                            </button>
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Footer Summary */}
            <div className="px-8 py-4 bg-[#1a1817] border-t border-[#2a2725] flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                        {RESOURCE_MAP.slice(0, 3).map((r, i) => (
                            <div key={i} className="w-5 h-5 rounded-full bg-[#121110] border border-[#2a2725] flex items-center justify-center">
                                <r.icon className="w-2.5 h-2.5 text-[#5c5450]" />
                            </div>
                        ))}
                    </div>
                    <span className="text-[9px] font-black text-[#5c5450] uppercase tracking-widest">
                        Total {RESOURCE_MAP.length} Modules Scoped
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />
                    <span className="text-[9px] font-black text-[#f2ece9] uppercase tracking-widest">Live Integration Ready</span>
                </div>
            </div>
        </div>
    );
};

export default PermissionsManager;
