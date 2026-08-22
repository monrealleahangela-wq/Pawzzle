import React, { useState } from 'react';
import { RefreshCcw, Save, Shield, Database, Users, Store, Activity } from 'lucide-react';

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

const ToggleSwitch = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    className={`w-9 h-5 min-h-0 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-300 ${checked ? 'bg-[#10b981]' : 'bg-slate-700'}`}
  >
    <span className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-300 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
  </button>
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
    <div className="space-y-4 animate-fade-in relative z-10 w-full max-w-7xl mx-auto">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 p-4 bg-[#1f1614] rounded-2xl shadow-sm border border-white/10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-secondary-500/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none transition-transform duration-700 group-hover:scale-150" />
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-secondary-500" />
            <h1 className="text-2xl font-black text-secondary-50 uppercase tracking-tight">Role Permissions</h1>
          </div>
          <p className="text-xs text-secondary-100/60 font-medium">Review which platform areas each role can access.</p>
        </div>
        <div className="relative z-10 flex flex-wrap gap-2">
          <button className="h-9 px-3 py-2 rounded-lg border border-secondary-500/30 text-secondary-500 hover:bg-secondary-500/10 transition-colors flex items-center gap-2 font-bold text-xs">
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
          <button className="h-9 px-3 py-2 rounded-lg border border-[#10b981]/30 text-[#10b981] hover:bg-[#10b981]/10 transition-colors font-bold text-xs">
            Sync Pages
          </button>
        </div>
      </div>

      {/* Main Permissions Content - Dark Theme Container */}
      <div className="bg-[#1f1614] rounded-2xl shadow-sm border border-white/10 overflow-hidden">
        
        {/* Role Header */}
        <div className="p-4 border-b border-white/10 bg-[#160e0d] flex justify-between items-center">
          <div>
            <h2 className="text-base font-bold text-secondary-50 tracking-wide">Store Owner</h2>
            <p className="text-xs text-secondary-100/50 mt-0.5">Role key: owner</p>
          </div>
          <button className="h-9 px-3 py-2 rounded-lg bg-[#10b981] hover:bg-emerald-400 text-white transition-colors flex items-center gap-2 font-bold text-xs shadow-sm">
            <Save className="h-4 w-4" /> Save
          </button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            {/* Permissions Table Header */}
            <div className="grid grid-cols-6 gap-3 p-3 px-4 bg-[#1a1312] border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-[#a89b98]">
              <div className="col-span-1">Area</div>
              <div className="text-center">View</div>
              <div className="text-center">Create</div>
              <div className="text-center">Update</div>
              <div className="text-center">Disable</div>
              <div className="text-center">Full Access</div>
            </div>

            {/* Permissions Table Rows */}
            <div className="divide-y divide-white/5">
              {permissionsData.map((resource) => (
                <div key={resource.id} className="grid grid-cols-6 gap-3 p-3 px-4 items-center hover:bg-white/[0.02] transition-colors">
              <div className="col-span-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-secondary-50">{resource.title}</span>
                </div>
                <p className="text-[11px] text-[#a89b98] leading-tight pr-4">{resource.description}</p>
              </div>
              
              <div className="flex justify-center">
                <ToggleSwitch 
                  checked={permissions[resource.id].view} 
                  onChange={() => handleToggle(resource.id, 'view')} 
                  label={`Allow viewing ${resource.title}`}
                />
              </div>
              <div className="flex justify-center">
                <ToggleSwitch 
                  checked={permissions[resource.id].create} 
                  onChange={() => handleToggle(resource.id, 'create')} 
                  label={`Allow creating ${resource.title}`}
                />
              </div>
              <div className="flex justify-center">
                <ToggleSwitch 
                  checked={permissions[resource.id].update} 
                  onChange={() => handleToggle(resource.id, 'update')} 
                  label={`Allow updating ${resource.title}`}
                />
              </div>
              <div className="flex justify-center">
                <ToggleSwitch 
                  checked={permissions[resource.id].disable} 
                  onChange={() => handleToggle(resource.id, 'disable')} 
                  label={`Allow disabling ${resource.title}`}
                />
              </div>
              <div className="flex justify-center border-l border-white/5 pl-4 ml-[-1rem]">
                <ToggleSwitch 
                  checked={permissions[resource.id].fullAccess} 
                  onChange={() => handleToggle(resource.id, 'fullAccess')} 
                  label={`Allow full access to ${resource.title}`}
                />
              </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RolePermissions;
