import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Edit3, Lock, RefreshCw, Save, ShieldCheck, Users, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { staffService } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { getUserFacingError } from '../../utils/userFacingError';

const labels = {
  manager: 'Manager', service_staff: 'Service Staff', cashier: 'Cashier', inventory_staff: 'Inventory Staff',
  procurement_officer: 'Procurement Officer', finance_staff: 'Finance Staff', veterinarian: 'Veterinarian',
  groomer: 'Groomer', trainer: 'Trainer', boarding_staff: 'Boarding Staff',
  delivery_rider: 'Delivery Rider'
};
const groups = [
  ['Customer Operations', ['bookings', 'sales', 'customers']],
  ['Store Operations', ['inventory', 'procurement', 'finance', 'logistics']],
  ['Care & Workforce', ['clinical', 'pet_updates', 'staff']],
  ['Oversight', ['reports', 'dss', 'settings']]
];
const resourceLabels = { bookings: 'Bookings', sales: 'Orders', inventory: 'Inventory', procurement: 'Procurement', finance: 'Finance', logistics: 'Delivery', customers: 'Customers', staff: 'Staff', reports: 'Reports', dss: 'DSS', settings: 'Settings', clinical: 'Clinical Records', pet_updates: 'Care Updates' };
const actionLabel = action => ({ update: 'Update Status', create: 'Create Update', manage: 'Manage', confirm: 'Confirm', cancel: 'Cancel' }[action] || action.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()));

export default function RoleManagement() {
  const { user } = useAuth();
  const isPlatform = ['super_admin', 'platform_admin'].includes(user?.role);
  const [data, setData] = useState(null);
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState('');
  const [editing, setEditing] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async requestedStoreId => {
    setLoading(true);
    try {
      let targetStoreId = requestedStoreId || storeId;
      if (isPlatform && !targetStoreId) {
        const configuration = (await staffService.getConfiguration()).data;
        setStores(configuration.branches || []);
        targetStoreId = configuration.store?._id || configuration.branches?.[0]?._id || '';
        setStoreId(targetStoreId);
      }
      setData((await staffService.getRolePermissions(targetStoreId ? { storeId: targetStoreId } : undefined)).data);
    } catch (error) { toast.error(getUserFacingError(error, 'Unable to load role permissions.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!editing) return undefined;
    const close = event => { if (event.key === 'Escape' && !saving) setEditing(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [editing, saving]);
  const catalog = data?.permissionCatalog || {};
  const visibleGroups = useMemo(() => groups.map(([label, resources]) => [label, resources.filter(resource => catalog[resource])]).filter(([, resources]) => resources.length), [catalog]);
  const open = role => { setEditing(role); setPermissions(JSON.parse(JSON.stringify(role.effective || {}))); };
  const toggle = (resource, action) => setPermissions(current => {
    const nextValue = !current[resource]?.[action];
    const nextActions = { ...(current[resource] || {}), [action]: nextValue };
    if (nextValue && action !== 'view' && catalog[resource]?.includes('view')) nextActions.view = true;
    if (action === 'manage' && nextValue && catalog[resource]?.includes('view')) nextActions.view = true;
    if (action === 'view' && !nextValue) Object.keys(nextActions).forEach(key => { if (key !== 'view') nextActions[key] = false; });
    return { ...current, [resource]: nextActions };
  });
  const save = async () => {
    setSaving(true);
    try {
      const response = await staffService.updateRolePermissions(editing.role, permissions, storeId || undefined);
      toast.success(response.data.message); setEditing(null); await load(storeId);
    } catch (error) { toast.error(getUserFacingError(error, 'Unable to update role permissions.')); }
    finally { setSaving(false); }
  };
  if (loading) return <div className="flex min-h-[45vh] items-center justify-center text-sm text-slate-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin"/>Loading role policies…</div>;

  return <div className="space-y-4 pb-24">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Store workforce</p><h1 className="mt-1 text-xl font-black text-slate-950">Role Management</h1><p className="mt-1 text-xs text-slate-500">Policies apply to every employee assigned to that role—never to a named individual.</p></div><div className="flex gap-2">{isPlatform&&<select aria-label="Store role-policy scope" value={storeId} onChange={event=>{setStoreId(event.target.value);load(event.target.value);}} className="h-9 rounded-lg border bg-white px-3 text-xs font-semibold">{stores.map(store=><option key={store._id} value={store._id}>{store.name}</option>)}</select>}<button onClick={()=>load(storeId)} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold"><RefreshCw size={13}/>Refresh</button></div></header>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><article className="rounded-xl border border-primary/20 bg-primary/5 p-3"><div className="flex items-center justify-between"><ShieldCheck size={16} className="text-primary"/><Lock size={12} className="text-primary"/></div><h2 className="mt-2 text-sm font-black">Store Owner</h2><p className="mt-1 text-[10px] text-slate-500">Full store authority · protected alias (`admin` / `store_owner`)</p><span className="mt-3 inline-block rounded-full bg-white px-2 py-1 text-[8px] font-bold uppercase text-primary">Not staff-selectable</span></article>{(data?.roles||[]).map(role=>{const enabled=Object.entries(role.effective||{}).flatMap(([resource,actions])=>Object.entries(actions).filter(([,value])=>value).map(([action])=>`${resource}.${action}`));return <article key={role.role} className="rounded-xl border bg-white p-3 shadow-sm"><div className="flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Users size={14}/></span><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">{role.staffCount||0} staff</span></div><h2 className="mt-2 text-sm font-black text-slate-900">{labels[role.role]||role.role}</h2><p className="mt-1 line-clamp-2 min-h-8 text-[9px] leading-relaxed text-slate-500">{enabled.length?enabled.slice(0,4).map(value=>value.replace('.', ' · ')).join(', '):'No operational actions enabled'}{enabled.length>4?` +${enabled.length-4} more`:''}</p><button onClick={()=>open(role)} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-[10px] font-bold hover:border-primary hover:text-primary"><Edit3 size={11}/>Edit Role</button></article>})}</div>
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[10px] leading-relaxed text-blue-800"><Lock size={12} className="mr-1.5 inline"/>Individual overrides are disabled. Enabling an operational action automatically preserves the required View permission; disabling View clears dependent actions.</div>
    {editing&&createPortal((
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="role-policy-title">
        <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-primary">Role access · {editing.staffCount||0} affected staff</p>
              <h2 id="role-policy-title" className="truncate text-base font-black text-slate-950 sm:text-lg">Edit {labels[editing.role]} permissions</h2>
              <p className="mt-0.5 text-[10px] text-slate-500">Changes apply to every staff member assigned to this role.</p>
            </div>
            <button onClick={()=>setEditing(null)} aria-label="Close role permissions" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X size={16}/></button>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto overscroll-contain p-3 sm:p-4 md:grid-cols-2">
            {visibleGroups.map(([groupLabel,resources])=><section key={groupLabel} className="self-start rounded-xl border border-slate-200 bg-slate-50/60 p-3"><h3 className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-500">{groupLabel}</h3><div className="space-y-2">{resources.map(resource=><article key={resource} className="rounded-lg border border-slate-200 bg-white p-2.5"><p className="mb-1.5 text-xs font-black text-slate-800">{resourceLabels[resource]||resource}</p><div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{catalog[resource].map(action=>{const disabled=action!=='view'&&catalog[resource].includes('view')&&!permissions[resource]?.view;return <label key={action} className={`flex min-h-9 items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 text-[10px] font-semibold ${disabled?'bg-slate-50 text-slate-300':'bg-slate-50 text-slate-700 hover:border-primary/20'}`}><span className="min-w-0 leading-tight">{actionLabel(action)}</span><input type="checkbox" disabled={disabled} checked={Boolean(permissions[resource]?.[action])} onChange={()=>toggle(resource,action)} className="h-4 w-4 shrink-0 rounded"/></label>})}</div></article>)}</div></section>)}
          </div>
          <footer className="flex shrink-0 gap-2 border-t bg-white px-3 py-3 sm:px-4"><button onClick={()=>setEditing(null)} className="h-9 flex-1 rounded-lg border text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button onClick={save} disabled={saving} className="inline-flex h-9 flex-[2] items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:opacity-50"><Save size={13}/>{saving?'Saving…':'Apply to Entire Role'}</button></footer>
        </div>
      </div>
    ), document.body)}
  </div>;
}
