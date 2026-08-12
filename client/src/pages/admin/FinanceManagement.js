import React, { useEffect, useState } from 'react';
import { DollarSign, Plus, Receipt, Truck, Wallet, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { financeService, purchaseOrderService } from '../../services/apiService';

const money = value => `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inputClass = 'w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-emerald-500';

export default function FinanceManagement() {
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('payments');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ purchaseOrder: '', amount: '', paymentMethod: 'bank_transfer', reference: '', category: 'Procurement', payee: '', description: '', taxCode: 'NON_VAT' });

  const load = async () => {
    try {
      const [s, e, p, o] = await Promise.all([financeService.getSummary(), financeService.getExpenses(), financeService.getProcurementPayments(), purchaseOrderService.getAll({ limit: 100 })]);
      setSummary(s.data); setExpenses(e.data.expenses || []); setPayments(p.data.payments || []); setOrders(o.data.orders || []);
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to load finance records'); }
  };
  useEffect(() => { load(); }, []);

  const submit = async event => {
    event.preventDefault();
    try {
      if (modal === 'payment') await financeService.createProcurementPayment({ purchaseOrder: form.purchaseOrder, amount: Number(form.amount), paymentMethod: form.paymentMethod, reference: form.reference });
      else await financeService.createExpense({ amount: Number(form.amount), category: form.category, payee: form.payee, description: form.description, taxCode: form.taxCode, status: 'draft' });
      toast.success(modal === 'payment' ? 'Payment recorded' : 'Expense saved'); setModal(null); await load();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to save record'); }
  };

  const setStatus = async (id, status) => { try { await financeService.updateExpenseStatus(id, { status }); await load(); } catch (e) { toast.error(e.response?.data?.message || 'Status update failed'); } };
  const voidPayment = async id => { const reason = window.prompt('Reason for voiding this payment:'); if (!reason) return; try { await financeService.voidProcurementPayment(id, { reason }); await load(); } catch (e) { toast.error(e.response?.data?.message || 'Unable to void payment'); } };

  return <div className="min-h-screen bg-slate-50 p-4 sm:p-6 space-y-5">
    <header className="bg-white border border-slate-100 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-[9px] font-black tracking-[.25em] text-emerald-600 uppercase">Operations</p><h1 className="text-2xl font-black text-slate-900">Finance</h1><p className="text-xs text-slate-500">Actual store expenses and procurement payments.</p></div>
      <div className="flex gap-2"><button onClick={() => setModal('expense')} className="h-9 px-3 rounded-lg bg-white border text-xs font-bold flex items-center gap-2"><Plus size={14}/> Expense</button><button onClick={() => setModal('payment')} className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-2"><Plus size={14}/> Payment</button></div>
    </header>
    <section className="grid grid-cols-2 lg:grid-cols-6 gap-3">{[
      ['Net sales revenue', summary?.revenue?.total, DollarSign], ['Output VAT', summary?.tax?.outputVat, Receipt], ['Rider payable', summary?.logistics?.riderPayable, Truck], ['Procurement paid', summary?.expenses?.procurementPaid, Wallet], ['Outstanding', summary?.expenses?.procurementOutstanding, Receipt], ['Operating result', summary?.operatingResultBeforeCogs, DollarSign]
    ].map(([label,value,Icon]) => <div key={label} className="bg-white border rounded-xl p-4"><Icon size={16} className="text-emerald-600 mb-2"/><p className="text-[9px] uppercase font-bold text-slate-400">{label}</p><p className="text-lg font-black text-slate-900">{money(value)}</p></div>)}</section>
    <div className="flex gap-1 bg-slate-900 p-1 rounded-xl w-fit">{['payments','expenses'].map(t => <button key={t} onClick={() => setTab(t)} className={`h-8 px-4 rounded-lg text-[10px] font-black uppercase ${tab===t?'bg-white text-slate-900':'text-white/60'}`}>{t}</button>)}</div>
    <section className="bg-white border rounded-2xl overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{(tab==='payments'?['Order','Supplier','Date','Amount','Method','Status','']:['Payee','Category','Date','Amount','Status','']).map((x,i)=><th key={i} className="p-3">{x}</th>)}</tr></thead><tbody>
      {tab==='payments' ? payments.map(p=><tr key={p._id} className="border-t"><td className="p-3 font-bold">{p.purchaseOrder?.orderNumber}</td><td className="p-3">{p.supplier?.businessName}</td><td className="p-3">{new Date(p.paymentDate).toLocaleDateString()}</td><td className="p-3 font-black">{money(p.amount)}</td><td className="p-3">{p.paymentMethod?.replace('_',' ')}</td><td className="p-3">{p.status}</td><td className="p-3">{p.status==='recorded'&&<button onClick={()=>voidPayment(p._id)} className="text-rose-600 font-bold">Void</button>}</td></tr>) : expenses.map(e=><tr key={e._id} className="border-t"><td className="p-3 font-bold">{e.payee}</td><td className="p-3">{e.category}</td><td className="p-3">{new Date(e.expenseDate).toLocaleDateString()}</td><td className="p-3 font-black">{money(e.grossAmount)}</td><td className="p-3">{e.status}</td><td className="p-3 flex gap-2">{e.status==='draft'&&<button onClick={()=>setStatus(e._id,'submitted')} className="text-indigo-600 font-bold">Submit</button>}{e.status==='submitted'&&<button onClick={()=>setStatus(e._id,'approved')} className="text-emerald-600 font-bold">Approve</button>}{e.status==='approved'&&<button onClick={()=>setStatus(e._id,'paid')} className="text-emerald-600 font-bold">Mark paid</button>}</td></tr>)}
    </tbody></table>{(tab==='payments'?payments:expenses).length===0&&<p className="p-8 text-center text-xs text-slate-400">No records yet.</p>}</section>
    {modal&&<div className="fixed inset-0 z-[100] bg-slate-900/50 flex items-center justify-center p-3"><form onSubmit={submit} className="bg-white w-full max-w-md rounded-2xl p-5 space-y-3"><div className="flex justify-between"><h2 className="text-base font-black">{modal==='payment'?'Record procurement payment':'Add expense'}</h2><button type="button" onClick={()=>setModal(null)}><X size={18}/></button></div>{modal==='payment'?<><select required className={inputClass} value={form.purchaseOrder} onChange={e=>setForm({...form,purchaseOrder:e.target.value})}><option value="">Select purchase order</option>{orders.filter(o=>!['paid','refunded'].includes(o.paymentStatus)&&!['cancelled','returned'].includes(o.status)).map(o=><option key={o._id} value={o._id}>{o.orderNumber} — {o.supplier?.businessName} — balance {money(o.totalCost-(o.paidAmount||0))}</option>)}</select><select className={inputClass} value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value})}>{['bank_transfer','gcash','maya','cod','credit_terms','cash','other'].map(x=><option key={x}>{x}</option>)}</select><input className={inputClass} placeholder="Reference (optional)" value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})}/></>:<><input required className={inputClass} placeholder="Payee" value={form.payee} onChange={e=>setForm({...form,payee:e.target.value})}/><input required className={inputClass} placeholder="Category" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/><input className={inputClass} placeholder="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></>}<input required min="0.01" step="0.01" type="number" className={inputClass} placeholder="Amount" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/><button className="w-full h-9 rounded-lg bg-emerald-600 text-white text-xs font-black">Save</button></form></div>}
  </div>;
}
