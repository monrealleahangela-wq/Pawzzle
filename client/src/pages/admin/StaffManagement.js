import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Archive, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight,
  Filter, KeyRound, Plus, RefreshCw, Search,
  ShieldCheck, Trash2, Upload, UserRound, Users, X
} from 'lucide-react';
import SpecializedStaffProfileModal from '../../components/admin/SpecializedStaffProfileModal';
import { getImageUrl, staffService, uploadService } from '../../services/apiService';
import { getUserFacingError } from '../../utils/userFacingError';

const ROLE_GROUPS = [
  ['Store Administration', [['manager', 'Manager']]],
  ['Service Operations', [['service_staff', 'Service Staff']]],
  ['Sales', [['cashier', 'Cashier']]],
  ['Inventory', [['inventory_staff', 'Inventory Staff']]],
  ['Procurement', [['procurement_officer', 'Procurement Officer']]],
  ['Finance', [['finance_staff', 'Finance Staff']]],
  ['Pet Care', [['veterinarian', 'Veterinarian'], ['groomer', 'Groomer'], ['trainer', 'Trainer'], ['boarding_staff', 'Boarding Staff']]],
  ['Delivery', [['delivery_dispatcher', 'Delivery Dispatcher'], ['delivery_rider', 'Delivery Rider']]]
];
const ROLES = ROLE_GROUPS.flatMap(([, roles]) => roles);
const SPECIALISTS = ['veterinarian', 'groomer', 'trainer', 'boarding_staff'];
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const roleLabel = value => ROLES.find(([id]) => id === value)?.[1] || String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const scheduleSummary = member => {
  const days = Object.entries(member.professionalProfile?.availability || {}).filter(([, value]) => value?.available);
  if (!days.length) return 'Not configured';
  return `${days.length} days · ${days[0][1].start || '09:00'}–${days[0][1].end || '17:00'}`;
};
const schedule = () => Object.fromEntries(DAYS.map(day => [day, { available: !['saturday', 'sunday'].includes(day), start: '09:00', end: '17:00', breaks: [{ start: '12:00', end: '13:00' }] }]));
const emptyForm = () => ({
  firstName: '', lastName: '', email: '', username: '', phone: '', avatar: '', avatarFile: null,
  address: { street: '', barangay: '', city: '', province: '', zipCode: '' },
  staffType: 'service_staff', targetStoreId: '', temporaryPassword: '', assignedServices: [],
  professionalProfile: { staffId: '', experienceYears: 0, bio: '', specialty: '', areasOfExpertise: [], certifications: [], availability: schedule(), leaveSchedule: [], registration: { type: '', number: '', expiresAt: '' } },
  riderProfile: { vehicleType: '', plateNumber: '', licenseId: '', deliveryZone: '', accountStatus: 'active' }
});
const statusTone = value => ({ available: 'bg-emerald-50 text-emerald-700', busy: 'bg-blue-50 text-blue-700', break: 'bg-violet-50 text-violet-700', on_leave: 'bg-amber-50 text-amber-700', emergency_unavailable: 'bg-rose-50 text-rose-700', temporary_unavailable: 'bg-orange-50 text-orange-700', verified: 'bg-emerald-50 text-emerald-700', active: 'bg-emerald-50 text-emerald-700', archived: 'bg-slate-100 text-slate-600', suspended: 'bg-rose-50 text-rose-700' }[value] || 'bg-slate-100 text-slate-600');
const Chip = ({ value, children }) => <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${statusTone(value)}`}>{children || String(value || 'pending').replaceAll('_', ' ')}</span>;
const Field = ({ label, children, hint }) => <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>{children}{hint && <span className="mt-1 block text-[10px] text-slate-400">{hint}</span>}</label>;
const input = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs outline-none transition focus:border-primary';

export default function StaffManagement() {
  const [staff, setStaff] = useState([]);
  const [archived, setArchived] = useState([]);
  const [configuration, setConfiguration] = useState({ services: [], branches: [], availableRoles: [], nextStaffId: '' });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('active');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [wizard, setWizard] = useState(null);
  const [profile, setProfile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const pageSize = 10;

  useEffect(() => {
    if (!wizard && !profile && !confirm) return undefined;
    const closeTopLayer = event => {
      if (event.key !== 'Escape' || submitting) return;
      if (confirm) setConfirm(null);
      else if (profile) setProfile(null);
      else setWizard(null);
    };
    window.addEventListener('keydown', closeTopLayer);
    return () => window.removeEventListener('keydown', closeTopLayer);
  }, [wizard, profile, confirm, submitting]);

  const load = async () => {
    setLoading(true);
    try {
      const [activeResponse, archivedResponse, configResponse] = await Promise.all([
        staffService.getAll(), staffService.getAll({ archived: true }), staffService.getConfiguration()
      ]);
      setStaff(activeResponse.data.staff || []);
      setArchived(archivedResponse.data.staff || []);
      setConfiguration(configResponse.data || {});
    } catch (error) { toast.error(getUserFacingError(error, 'Unable to load staff management.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    const source = tab === 'archived' ? archived : staff;
    const normalized = query.trim().toLowerCase();
    return source.filter(member => {
      const name = `${member.firstName || ''} ${member.lastName || ''} ${member.email || ''} ${member.professionalProfile?.staffId || ''} ${member.riderProfile?.staffId || ''}`.toLowerCase();
      const verification = member.professionalProfile?.verification?.status || 'pending_verification';
      return (!normalized || name.includes(normalized)) && (!roleFilter || member.staffType === roleFilter)
        && (!availabilityFilter || member.availabilityStatus === availabilityFilter)
        && (!verificationFilter || verification === verificationFilter);
    }).sort((a, b) => sort === 'name' ? `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      : sort === 'role' ? roleLabel(a.staffType).localeCompare(roleLabel(b.staffType))
        : new Date(b.createdAt) - new Date(a.createdAt));
  }, [staff, archived, tab, query, roleFilter, availabilityFilter, verificationFilter, sort]);
  useEffect(() => setPage(1), [tab, query, roleFilter, availabilityFilter, verificationFilter, sort]);
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);
  const totals = useMemo(() => ({
    total: staff.length,
    active: staff.filter(row => row.isActive !== false && (!row.staffStatus || row.staffStatus === 'active')).length,
    busy: staff.filter(row => row.availabilityStatus === 'busy').length,
    leave: staff.filter(row => row.availabilityStatus === 'on_leave').length,
    pending: staff.filter(row => !['verified', 'expired', 'suspended'].includes(row.professionalProfile?.verification?.status)).length
  }), [staff]);

  const openCreate = () => {
    const form = emptyForm();
    form.targetStoreId = configuration.store?._id || configuration.branches?.[0]?._id || '';
    form.professionalProfile.staffId = configuration.nextStaffId || 'Generated when saved';
    setWizard({ step: 1, editing: null, error: '', form });
  };
  const openEdit = member => {
    const form = emptyForm();
    setWizard({ step: 1, editing: member, error: '', form: {
      ...form, ...member, avatarFile: null, targetStoreId: member.store?._id || member.store,
      address: { ...form.address, ...(member.address || {}) }, temporaryPassword: '',
      assignedServices: (member.assignedServices || []).map(service => service._id),
      professionalProfile: { ...form.professionalProfile, ...(member.professionalProfile || {}), availability: { ...form.professionalProfile.availability, ...(member.professionalProfile?.availability || {}) } },
      riderProfile: { ...form.riderProfile, ...(member.riderProfile || {}) }
    }});
  };
  const setForm = patch => setWizard(current => ({ ...current, error: '', form: { ...current.form, ...patch } }));
  const setProfessional = patch => setForm({ professionalProfile: { ...wizard.form.professionalProfile, ...patch } });
  const validateStep = () => {
    const form = wizard.form;
    if (wizard.step === 1 && (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim() || (!wizard.editing && !form.email.trim()))) return 'Complete the required basic information.';
    if (wizard.step === 2 && (!form.staffType || !form.targetStoreId)) return 'Select a role and assigned store.';
    if (wizard.step === 2 && SPECIALISTS.includes(form.staffType) && !form.assignedServices.length) return 'Assign at least one compatible service.';
    if (wizard.step === 2 && form.staffType === 'delivery_rider' && (!form.riderProfile.vehicleType || !form.riderProfile.licenseId)) return 'Complete the rider license and vehicle details.';
    if (wizard.step === 3 && !wizard.editing && (!form.username.trim() || !form.temporaryPassword)) return 'Enter a username and temporary password.';
    return '';
  };
  const next = () => { const error = validateStep(); if (error) return setWizard(current => ({ ...current, error })); setWizard(current => ({ ...current, error: '', step: Math.min(3, current.step + 1) })); };
  const submit = async () => {
    const error = validateStep(); if (error) return setWizard(current => ({ ...current, error }));
    setSubmitting(true);
    try {
      let avatar = wizard.form.avatar || '';
      if (wizard.form.avatarFile) {
        const data = new FormData(); data.append('image', wizard.form.avatarFile);
        avatar = (await uploadService.uploadImage(data)).data.url;
      }
      const payload = { ...wizard.form, avatar };
      delete payload.avatarFile;
      if (wizard.editing) {
        delete payload.email; delete payload.username; delete payload.temporaryPassword;
        await staffService.update(wizard.editing._id, { ...payload, confirmRoleChange: true, confirmUpcoming: true, confirmBranchChange: true });
        toast.success('Staff profile updated.');
      } else {
        const response = await staffService.create(payload);
        toast.success(response.data.emailSent === false ? 'Staff created; invitation email could not be sent.' : 'Staff account created.');
      }
      setWizard(null); await load();
    } catch (requestError) { toast.error(getUserFacingError(requestError, 'Unable to save staff member.')); }
    finally { setSubmitting(false); }
  };
  const viewProfile = async member => {
    try { setProfile((await staffService.getProfile(member._id)).data); }
    catch (error) { toast.error(getUserFacingError(error, 'Unable to load staff profile.')); }
  };
  const runAction = async action => {
    setSubmitting(true);
    try {
      if (action.kind === 'status') await staffService.toggleStatus(action.member._id, { isActive: !action.member.isActive, confirmUpcoming: true });
      if (action.kind === 'archive') await staffService.archive(action.member._id, { confirmUpcoming: true });
      if (action.kind === 'restore') await staffService.restore(action.member._id);
      if (action.kind === 'reset') await staffService.resetPassword(action.member._id, action.value);
      if (action.kind === 'permanent') await staffService.permanentDelete(action.member._id, action.value);
      toast.success(action.success || 'Staff account updated.'); setConfirm(null); await load();
    } catch (error) { toast.error(getUserFacingError(error, 'Unable to complete this action.')); }
    finally { setSubmitting(false); }
  };
  const chooseAction = (member, value) => {
    if (!value) return;
    if (value === 'view') return viewProfile(member);
    if (value === 'activity') return viewProfile(member);
    if (value === 'edit') return openEdit(member);
    if (value === 'reset') return setConfirm({ kind: 'reset', member, title: 'Reset password', prompt: 'New temporary password', value: '', success: 'Temporary password updated.' });
    if (value === 'archive') return setConfirm({ kind: 'archive', member, title: 'Archive staff member?', message: 'The account will leave Active Staff while bookings and audit history remain intact.', success: 'Staff account archived.' });
    if (value === 'restore') return setConfirm({ kind: 'restore', member, title: 'Restore staff member?', message: 'The account will return to active staff management.', success: 'Staff account restored.' });
    if (value === 'permanent') return setConfirm({ kind: 'permanent', member, title: 'Permanently disable account?', message: 'Login identity is removed while historical relationships remain preserved. Type PERMANENTLY DELETE to confirm.', value: '', prompt: 'Confirmation phrase', success: 'Staff account permanently disabled.' });
    if (value === 'status') return setConfirm({ kind: 'status', member, title: member.isActive ? 'Deactivate staff member?' : 'Activate staff member?', message: 'Existing historical records will not be changed.', success: member.isActive ? 'Staff account deactivated.' : 'Staff account activated.' });
  };

  return <div className="mx-auto max-w-[1500px] space-y-4 p-3 sm:p-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Workforce operations</p><h1 className="text-xl font-black text-slate-900">Staff Management</h1><p className="mt-1 text-xs text-slate-500">Accounts, schedules, qualifications, assignments, and role-inherited access.</p></div><div className="flex gap-2"><Link to="/admin/roles" className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold text-slate-700"><ShieldCheck size={14}/>Role Management</Link><button onClick={openCreate} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-white"><Plus size={14}/>Add Staff</button></div></header>
    <section className="grid grid-cols-2 gap-2 md:grid-cols-5">{[[Users,'Total Staff',totals.total],[CheckCircle2,'Active',totals.active],[RefreshCw,'Busy',totals.busy],[CalendarDays,'On Leave',totals.leave],[ShieldCheck,'Pending Verification',totals.pending]].map(([Icon,label,value])=><article key={label} className="rounded-xl border bg-white p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase text-slate-500">{label}</span><Icon size={14} className="text-primary"/></div><strong className="mt-2 block text-xl text-slate-900">{value}</strong></article>)}</section>
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center"><div className="flex rounded-lg bg-slate-100 p-0.5">{[['active','Active Staff'],['matrix','Assignment Matrix'],['archived','Archived Staff']].map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${tab===id?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>{label}</button>)}</div><div className="relative min-w-0 flex-1"><Search size={13} className="absolute left-3 top-2.5 text-slate-400"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search name, email, or staff ID" className={`${input} pl-8`}/></div><Filter size={13} className="hidden text-slate-400 lg:block"/><select value={roleFilter} onChange={event=>setRoleFilter(event.target.value)} className={input}><option value="">All roles</option>{ROLE_GROUPS.map(([group,roles])=><optgroup key={group} label={group}>{roles.map(([id,label])=><option key={id} value={id}>{label}</option>)}</optgroup>)}</select><select value={availabilityFilter} onChange={event=>setAvailabilityFilter(event.target.value)} className={input}><option value="">All availability</option>{['available','busy','break','on_leave','temporary_unavailable','emergency_unavailable'].map(value=><option key={value} value={value}>{roleLabel(value)}</option>)}</select><select value={verificationFilter} onChange={event=>setVerificationFilter(event.target.value)} className={input}><option value="">All verification</option>{['pending_verification','verified','expired','suspended'].map(value=><option key={value} value={value}>{roleLabel(value)}</option>)}</select><select value={sort} onChange={event=>setSort(event.target.value)} className={input}><option value="recent">Recently Added</option><option value="name">Name</option><option value="role">Role</option></select><button onClick={load} aria-label="Refresh staff" className="h-9 w-9 shrink-0 rounded-lg border text-slate-500"><RefreshCw size={13} className="mx-auto"/></button></div>
      {tab === 'matrix' ? <AssignmentMatrix rows={staff}/>:<StaffTable loading={loading} rows={paged} archived={tab==='archived'} onAction={chooseAction}/>}
      {tab !== 'matrix' && <footer className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-slate-500"><span>{rows.length ? `${(page-1)*pageSize+1}–${Math.min(page*pageSize,rows.length)} of ${rows.length}` : '0 staff'}</span><div className="flex gap-1"><button disabled={page===1} onClick={()=>setPage(value=>value-1)} className="h-8 w-8 rounded-lg border disabled:opacity-30"><ChevronLeft size={13} className="mx-auto"/></button><button disabled={page*pageSize>=rows.length} onClick={()=>setPage(value=>value+1)} className="h-8 w-8 rounded-lg border disabled:opacity-30"><ChevronRight size={13} className="mx-auto"/></button></div></footer>}
    </section>
    {wizard && <StaffWizard state={wizard} setState={setWizard} setForm={setForm} setProfessional={setProfessional} config={configuration} next={next} submit={submit} submitting={submitting}/>}
    {profile && <SpecializedStaffProfileModal data={profile} onClose={()=>setProfile(null)}/>}
    {confirm && <ConfirmDialog action={confirm} setAction={setConfirm} submit={runAction} submitting={submitting}/>}
  </div>;
}

function StaffTable({ loading, rows, archived, onAction }) {
  if (loading) return <div className="space-y-2 p-3">{[1,2,3,4].map(value=><div key={value} className="h-14 animate-pulse rounded-lg bg-slate-100"/>)}</div>;
  if (!rows.length) return <div className="p-12 text-center"><Users size={24} className="mx-auto text-slate-300"/><p className="mt-2 text-xs font-bold text-slate-600">No staff match these filters.</p></div>;
  return <div className="max-h-[62vh] overflow-auto"><table className="w-full min-w-[1180px] text-left"><thead className="sticky top-0 z-10 bg-slate-50 text-[9px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Profile</th><th>Staff ID</th><th>Name</th><th>Role</th><th>Status</th><th>Availability</th><th>Schedule</th><th>Verification</th><th>Assigned Services</th><th className="px-3 text-right">Actions</th></tr></thead><tbody className="divide-y">{rows.map(member=>{const staffId=member.professionalProfile?.staffId||member.riderProfile?.staffId||'—';const services=member.assignedServices||[];return <tr key={member._id} className="text-xs hover:bg-slate-50/70"><td className="px-3 py-2">{member.avatar?<img src={getImageUrl(member.avatar)} alt="" className="h-9 w-9 rounded-lg object-cover"/>:<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100"><UserRound size={14}/></div>}</td><td><span className="font-mono text-[10px] font-bold text-slate-600">{staffId}</span></td><td><b className="block text-[11px] text-slate-900">{member.firstName} {member.lastName}</b><small className="text-[9px] text-slate-400">{member.email}</small></td><td><b className="text-[10px] text-slate-700">{roleLabel(member.staffType)}</b></td><td><Chip value={member.staffStatus||'active'}>{member.staffStatus||'active'}</Chip></td><td><Chip value={member.availabilityStatus}>{member.availabilityStatus?.replaceAll('_',' ')||'available'}</Chip>{member.activeWorkload>=3&&<span className="mt-1 block text-[8px] font-bold text-rose-600">High workload</span>}</td><td><span className="text-[10px] text-slate-600">{scheduleSummary(member)}</span></td><td><Chip value={member.professionalProfile?.verification?.status}>{member.professionalProfile?.verification?.status?.replaceAll('_',' ')||'not required'}</Chip></td><td><span title={services.map(service=>service.name).join(', ')} className="block max-w-36 truncate text-[10px] text-slate-600">{services.length?`${services.length} · ${services.map(service=>service.name).slice(0,2).join(', ')}`:'None'}</span></td><td className="px-3 text-right"><select aria-label={`Actions for ${member.firstName}`} defaultValue="" onChange={event=>{onAction(member,event.target.value);event.target.value='';}} className="h-8 rounded-lg border bg-white px-2 text-[10px] font-bold"><option value="" disabled>Actions</option><option value="view">View profile</option><option value="activity">View activity</option>{!archived&&<option value="edit">Edit</option>}{!archived&&<option value="reset">Reset password</option>}{!archived&&<option value="status">{member.isActive?'Deactivate':'Activate'}</option>}{!archived&&<option value="archive">Archive</option>}{archived&&<option value="restore">Restore</option>}{archived&&<option value="permanent">Permanently disable</option>}</select></td></tr>})}</tbody></table></div>;
}

function AssignmentMatrix({ rows }) {
  const groups = ['available','busy','break','on_leave','emergency_unavailable','temporary_unavailable'];
  return <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{groups.map(group=><section key={group} className="min-h-40 rounded-xl bg-slate-50 p-2.5"><div className="mb-2 flex items-center justify-between"><b className="text-[10px] uppercase text-slate-600">{group.replaceAll('_',' ')}</b><Chip value={group}>{rows.filter(row=>(row.availabilityStatus||'available')===group).length}</Chip></div><div className="space-y-2">{rows.filter(row=>(row.availabilityStatus||'available')===group).map(member=><article key={member._id} className={`rounded-lg border bg-white p-2 ${member.activeWorkload>=3?'border-rose-200':''}`}><p className="truncate text-[11px] font-bold text-slate-800">{member.firstName} {member.lastName}</p><p className="truncate text-[9px] text-slate-500">{roleLabel(member.staffType)} · {member.activeWorkload||0} active</p><p className="mt-1 text-[8px] text-slate-400">{scheduleSummary(member)}</p>{member.activeWorkload>=3&&<p className="mt-1 text-[8px] font-bold text-rose-600">Overloaded · review before assignment</p>}</article>)}{!rows.some(row=>(row.availabilityStatus||'available')===group)&&<p className="py-6 text-center text-[10px] text-slate-400">No staff</p>}</div></section>)}</div>;
}

function StaffWizard({ state, setState, setForm, setProfessional, config, next, submit, submitting }) {
  const { form, step, editing } = state;
  const isSpecialist = SPECIALISTS.includes(form.staffType);
  const specialtyLabel = ({ veterinarian: 'Clinical specialization', groomer: 'Grooming specialties', trainer: 'Training specialties', boarding_staff: 'Boarding specialization' })[form.staffType] || 'Specialization';
  return <div className="fixed inset-0 z-[70] flex justify-end bg-black/45"><div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"><header className="flex items-center justify-between border-b p-4"><div><p className="text-[9px] font-bold uppercase tracking-widest text-primary">Step {step} of 3</p><h2 className="text-lg font-black">{editing?'Edit Staff':'Add Staff'} · {['Basic Information','Job Information','Account & Review'][step-1]}</h2></div><button onClick={()=>setState(null)} className="h-8 w-8 rounded-lg bg-slate-100"><X size={14} className="mx-auto"/></button></header><div className="grid grid-cols-3 border-b">{['Basic','Job','Account'].map((label,index)=><div key={label} className={`h-1 ${step>=index+1?'bg-primary':'bg-slate-100'}`}/>)}</div>
    <div className="flex-1 overflow-y-auto p-4">{state.error&&<div role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">{state.error}</div>}{step===1&&<div className="grid gap-3 sm:grid-cols-2"><Field label="Profile Photo"><div className="flex items-center gap-3"><div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-slate-100">{form.avatarFile?<img src={URL.createObjectURL(form.avatarFile)} alt="Preview" className="h-full w-full object-cover"/>:form.avatar?<img src={getImageUrl(form.avatar)} alt="" className="h-full w-full object-cover"/>:<UserRound size={18}/>}</div><label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-bold"><Upload size={13}/>Choose<input type="file" accept="image/*" className="hidden" onChange={event=>setForm({avatarFile:event.target.files?.[0]||null})}/></label></div></Field><span/><Field label="First Name"><input className={input} value={form.firstName} onChange={event=>setForm({firstName:event.target.value})}/></Field><Field label="Last Name"><input className={input} value={form.lastName} onChange={event=>setForm({lastName:event.target.value})}/></Field><Field label="Mobile Number"><input className={input} value={form.phone} onChange={event=>setForm({phone:event.target.value})} placeholder="09XXXXXXXXX"/></Field><Field label="Email"><input disabled={editing} className={`${input} disabled:bg-slate-50`} type="email" value={form.email} onChange={event=>setForm({email:event.target.value})}/></Field><Field label="Street"><input className={input} value={form.address.street} onChange={event=>setForm({address:{...form.address,street:event.target.value}})}/></Field><Field label="Barangay"><input className={input} value={form.address.barangay} onChange={event=>setForm({address:{...form.address,barangay:event.target.value}})}/></Field><Field label="City"><input className={input} value={form.address.city} onChange={event=>setForm({address:{...form.address,city:event.target.value}})}/></Field><Field label="Province"><input className={input} value={form.address.province} onChange={event=>setForm({address:{...form.address,province:event.target.value}})}/></Field></div>}
      {step===2&&<div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Staff ID" hint="Reserved atomically when the account is created."><input readOnly className={`${input} bg-slate-50 font-mono`} value={form.professionalProfile.staffId || config.nextStaffId || 'Auto-generated'}/></Field><Field label="Role"><select className={input} value={form.staffType} onChange={event=>setForm({staffType:event.target.value,assignedServices:[]})}>{ROLE_GROUPS.map(([group,roles])=><optgroup key={group} label={group}>{roles.filter(([id])=>!config.availableRoles?.length||config.availableRoles.includes(id)).map(([id,label])=><option key={id} value={id}>{label}</option>)}</optgroup>)}</select></Field><Field label="Assigned Store"><select className={input} value={form.targetStoreId} onChange={event=>setForm({targetStoreId:event.target.value})}>{(config.branches||[]).map(branch=><option key={branch._id} value={branch._id}>{branch.name}</option>)}</select></Field><Field label="Experience (years)"><input className={input} type="number" min="0" value={form.professionalProfile.experienceYears||0} onChange={event=>setProfessional({experienceYears:Number(event.target.value)})}/></Field>{isSpecialist&&<><Field label={specialtyLabel}><input className={input} value={form.professionalProfile.specialty||''} onChange={event=>setProfessional({specialty:event.target.value})}/></Field><Field label="Certifications"><input className={input} value={(form.professionalProfile.certifications||[]).map(item=>item?.name||item).join(', ')} onChange={event=>setProfessional({certifications:event.target.value.split(',').map(value=>value.trim()).filter(Boolean)})} placeholder="Comma separated"/></Field></>}{form.staffType==='veterinarian'&&<><Field label="PRC License Number"><input className={input} value={form.professionalProfile.registration?.number||''} onChange={event=>setProfessional({registration:{...form.professionalProfile.registration,type:'professional_license',number:event.target.value}})}/></Field><Field label="PRC License Expiry"><input className={input} type="date" value={form.professionalProfile.registration?.expiresAt?.slice?.(0,10)||''} onChange={event=>setProfessional({registration:{...form.professionalProfile.registration,expiresAt:event.target.value}})}/></Field></>}{['delivery_dispatcher','delivery_rider'].includes(form.staffType)&&<Field label="Assigned Logistics Area"><input className={input} value={form.riderProfile.deliveryZone||''} onChange={event=>setForm({riderProfile:{...form.riderProfile,deliveryZone:event.target.value}})} placeholder="Branch service area"/></Field>}{form.staffType==='delivery_rider'&&<><Field label="Driver's License"><input className={input} value={form.riderProfile.licenseId} onChange={event=>setForm({riderProfile:{...form.riderProfile,licenseId:event.target.value}})}/></Field><Field label="Vehicle Type"><select className={input} value={form.riderProfile.vehicleType} onChange={event=>setForm({riderProfile:{...form.riderProfile,vehicleType:event.target.value}})}><option value="">Select</option><option value="motorcycle">Motorcycle</option><option value="bicycle">Bicycle</option><option value="car">Car</option><option value="van">Van</option></select></Field><Field label="Plate Number"><input className={input} value={form.riderProfile.plateNumber} onChange={event=>setForm({riderProfile:{...form.riderProfile,plateNumber:event.target.value}})}/></Field></>}</div>{isSpecialist&&<Field label={form.staffType==='boarding_staff'?'Boarding Services':'Services Handled'}><div className="grid gap-2 sm:grid-cols-2">{(config.services||[]).map(service=><label key={service._id} className="flex items-center gap-2 rounded-lg border p-2 text-xs"><input type="checkbox" checked={form.assignedServices.includes(service._id)} onChange={event=>setForm({assignedServices:event.target.checked?[...form.assignedServices,service._id]:form.assignedServices.filter(id=>id!==service._id)})}/><span><b className="block">{service.name}</b><small className="text-slate-400">{roleLabel(service.category)}</small></span></label>)}</div></Field>}<div><p className="mb-2 text-[10px] font-bold uppercase text-slate-500">Working Schedule, Breaks & Availability</p><div className="grid gap-2 sm:grid-cols-2">{DAYS.map(day=>{const value=form.professionalProfile.availability?.[day]||{};return <div key={day} className="rounded-lg border p-2"><label className="flex items-center justify-between text-[11px] font-bold capitalize"><span>{day}</span><input type="checkbox" checked={Boolean(value.available)} onChange={event=>setProfessional({availability:{...form.professionalProfile.availability,[day]:{...value,available:event.target.checked}}})}/></label>{value.available&&<div className="mt-2 grid grid-cols-2 gap-1"><input type="time" className={input} value={value.start||'09:00'} onChange={event=>setProfessional({availability:{...form.professionalProfile.availability,[day]:{...value,start:event.target.value}}})}/><input type="time" className={input} value={value.end||'17:00'} onChange={event=>setProfessional({availability:{...form.professionalProfile.availability,[day]:{...value,end:event.target.value}}})}/><input type="time" aria-label={`${day} break start`} className={input} value={value.breaks?.[0]?.start||'12:00'} onChange={event=>setProfessional({availability:{...form.professionalProfile.availability,[day]:{...value,breaks:[{start:event.target.value,end:value.breaks?.[0]?.end||'13:00'}]}}})}/><input type="time" aria-label={`${day} break end`} className={input} value={value.breaks?.[0]?.end||'13:00'} onChange={event=>setProfessional({availability:{...form.professionalProfile.availability,[day]:{...value,breaks:[{start:value.breaks?.[0]?.start||'12:00',end:event.target.value}]}}})}/></div>}</div>})}</div></div></div>}
      {step===3&&<div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Username"><input disabled={editing} className={`${input} disabled:bg-slate-50`} value={form.username} onChange={event=>setForm({username:event.target.value})}/></Field>{!editing&&<Field label="Temporary Password" hint="At least 8 characters with upper, lower, number, and symbol."><input className={input} type="password" value={form.temporaryPassword} onChange={event=>setForm({temporaryPassword:event.target.value})}/></Field>}</div><section className="rounded-xl border bg-slate-50 p-3"><h3 className="text-xs font-black">Review Summary</h3><dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="text-slate-400">Staff</dt><dd className="font-bold">{form.firstName} {form.lastName}</dd></div><div><dt className="text-slate-400">Role</dt><dd className="font-bold">{roleLabel(form.staffType)}</dd></div><div><dt className="text-slate-400">Staff ID</dt><dd className="font-mono font-bold">{form.professionalProfile.staffId||config.nextStaffId}</dd></div><div><dt className="text-slate-400">Schedule</dt><dd className="font-bold">{Object.values(form.professionalProfile.availability||{}).filter(value=>value.available).length} working days</dd></div></dl><p className="mt-3 rounded-lg bg-blue-50 p-2 text-[10px] text-blue-700">Permissions are inherited from the {roleLabel(form.staffType)} role. Individual overrides are not available.</p></section></div>}</div>
    <footer className="flex items-center justify-between border-t p-4"><button disabled={step===1} onClick={()=>setState(current=>({...current,step:current.step-1}))} className="h-9 rounded-lg border px-3 text-xs font-bold disabled:opacity-30">Back</button>{step<3?<button onClick={next} className="h-9 rounded-lg bg-primary px-4 text-xs font-bold text-white">Continue</button>:<button disabled={submitting} onClick={submit} className="h-9 rounded-lg bg-primary px-4 text-xs font-bold text-white disabled:opacity-50">{submitting?'Saving…':editing?'Save Changes':'Create Staff'}</button>}</footer></div></div>;
}

function ConfirmDialog({ action, setAction, submit, submitting }) {
  const valid = action.kind !== 'permanent' || action.value === 'PERMANENTLY DELETE';
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3"><div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-2xl"><div className="flex items-start justify-between"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">{action.kind==='permanent'?<Trash2 size={15}/>:action.kind==='reset'?<KeyRound size={15}/>:<Archive size={15}/>}</div><button onClick={()=>setAction(null)}><X size={15}/></button></div><h3 className="mt-3 text-base font-black text-slate-900">{action.title}</h3>{action.message&&<p className="mt-1 text-xs leading-relaxed text-slate-500">{action.message}</p>}{action.prompt&&<Field label={action.prompt}><input autoFocus type={action.kind==='reset'?'password':'text'} className={`${input} mt-3`} value={action.value||''} onChange={event=>setAction(current=>({...current,value:event.target.value}))}/></Field>}<div className="mt-4 flex justify-end gap-2"><button onClick={()=>setAction(null)} className="h-9 rounded-lg border px-3 text-xs font-bold">Cancel</button><button disabled={submitting||!valid||Boolean(action.prompt&&!action.value)} onClick={()=>submit(action)} className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-40">Confirm</button></div></div></div>;
}
