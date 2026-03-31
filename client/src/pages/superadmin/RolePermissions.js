import React, { useState } from 'react';
import { RefreshCcw, Save, Shield, Database, Users, Store, Activity, Settings, RefreshCw, AlertCircle } from 'lucide-react';
import { Card } from '../../../components/ui/Card';

const permissionsData = [
  {
    id: 'db',
    title: 'Backup Database',
    description: 'Generate and download platform backups.',
    icon: Database
  },
  {
    id: 'stores',
    title: 'Store Branches',
    description: 'Manage store profiles and locations.',
    icon: Store
  },
  {
    id: 'staff',
    title: 'Staff Accounts',
    description: 'Staff accounts and approvals.',
    icon: Users
  },
  {
    id: 'attendance',
    title: 'Activity Logs',
    description: 'System activity records and sessions.',
    icon: Activity
  },
  {
    id: 'clients',
    title: 'Customers',
    description: 'Customer profiles and history.',
    icon: Users
  },
  {
    id: 'appointments',
    title: 'Bookings & Orders',
    description: 'Schedules and platform transactions.',
    icon: Shield
  }
];

const ToggleSwitch = ({ checked, onChange }) => (
  <div 
    onClick={onChange}
    className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${checked ? 'bg-[#10b981]' : 'bg-slate-700'}`}
  >
    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
  </div>
);

const RolePermissions = () => {
  // State for permissions matrix
  const [permissions, setPermissions] = useState(() => {
    const initialState = {};
    permissionsData.forEach(p => {
      initialState[p.id] = { view: true, create: false, update: false, disable: false, fullAccess: false };
    });
    return initialState;
  });

  const handleToggle = (rowId, field) => {
    setPermissions(prev => {
      const row = { ...prev[rowId] };
      row[field] = !row[field];
      
      // If fullAccess is toggled ON, turn all others ON.
      if (field === 'fullAccess' && row.fullAccess) {
        row.view = true;
        row.create = true;
        row.update = true;
        row.disable = true;
      }
      
      // If any specific field is toggled OFF, guarantee fullAccess is OFF.
      if (field !== 'fullAccess' && !row[field]) {
        row.fullAccess = false;
      }
      
      // If all specific fields are ON, automatically enable fullAccess.
      if (row.view && row.create && row.update && row.disable) {
        row.fullAccess = true;
      }

      return { ...prev, [rowId]: row };
    });
  };

  return (
    <div className="space-y-6 animate-fade-in relative z-10 w-full max-w-7xl mx-auto">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-6 bg-[#1f1614] rounded-[24px] shadow-2xl border border-white/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none transition-transform duration-700 group-hover:scale-150" />
        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-amber-500" />
            <h1 className="text-3xl font-black text-amber-50 uppercase tracking-tight">Permissions</h1>
          </div>
          <p className="text-amber-100/60 font-medium">Manage role permissions for platform users.</p>
        </div>
        <div className="relative z-10 mt-4 md:mt-0 flex gap-3">
          <button className="px-5 py-2.5 rounded-xl border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 transition-colors flex items-center gap-2 font-bold text-sm">
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
          <button className="px-5 py-2.5 rounded-xl border border-[#10b981]/30 text-[#10b981] hover:bg-[#10b981]/10 transition-colors font-bold text-sm">
            Sync To Current Pages
          </button>
        </div>
      </div>

      {/* Main Permissions Content - Dark Theme Container */}
      <div className="bg-[#1f1614] rounded-[24px] shadow-2xl border border-white/5 overflow-hidden">
        
        {/* Role Header */}
        <div className="p-6 border-b border-white/10 bg-[#160e0d] flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-amber-50 tracking-wide">Owner</h2>
            <p className="text-xs text-amber-100/50 mt-1">Role Key: Owner</p>
          </div>
          <button className="px-8 py-2.5 rounded-xl bg-[#10b981] hover:bg-[#0ea5e9] hover:bg-emerald-400 text-white transition-colors flex items-center gap-2 font-bold text-sm shadow-lg shadow-emerald-500/20">
            <Save className="h-4 w-4" /> Save
          </button>
        </div>

        {/* Permissions Table Header */}
        <div className="grid grid-cols-6 gap-4 p-4 px-6 bg-[#1a1312] border-b border-white/10 text-xs font-black uppercase tracking-widest text-[#a89b98]">
          <div className="col-span-1">Resource</div>
          <div className="text-center">View</div>
          <div className="text-center">Create</div>
          <div className="text-center">Update</div>
          <div className="text-center">Disable</div>
          <div className="text-center">Full Access</div>
        </div>

        {/* Permissions Table Rows */}
        <div className="divide-y divide-white/5">
          {permissionsData.map((resource) => (
            <div key={resource.id} className="grid grid-cols-6 gap-4 p-4 px-6 items-center hover:bg-white/[0.02] transition-colors">
              <div className="col-span-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-amber-50">{resource.title}</span>
                </div>
                <p className="text-[11px] text-[#a89b98] leading-tight pr-4">{resource.description}</p>
              </div>
              
              <div className="flex justify-center">
                <ToggleSwitch 
                  checked={permissions[resource.id].view} 
                  onChange={() => handleToggle(resource.id, 'view')} 
                />
              </div>
              <div className="flex justify-center">
                <ToggleSwitch 
                  checked={permissions[resource.id].create} 
                  onChange={() => handleToggle(resource.id, 'create')} 
                />
              </div>
              <div className="flex justify-center">
                <ToggleSwitch 
                  checked={permissions[resource.id].update} 
                  onChange={() => handleToggle(resource.id, 'update')} 
                />
              </div>
              <div className="flex justify-center">
                <ToggleSwitch 
                  checked={permissions[resource.id].disable} 
                  onChange={() => handleToggle(resource.id, 'disable')} 
                />
              </div>
              <div className="flex justify-center border-l border-white/5 pl-4 ml-[-1rem]">
                <ToggleSwitch 
                  checked={permissions[resource.id].fullAccess} 
                  onChange={() => handleToggle(resource.id, 'fullAccess')} 
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RolePermissions;
