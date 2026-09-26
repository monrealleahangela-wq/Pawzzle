import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { supplierService } from '../../services/apiService';

const SupplierActivation = () => {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, message: '' });

  useEffect(() => {
    let active = true;
    supplierService.activateInvitation(token)
      .then(response => active && setState({ loading: false, success: true, message: response.data.message }))
      .catch(error => active && setState({
        loading: false,
        success: false,
        message: error.response?.data?.message || 'Unable to activate this supplier invitation.'
      }));
    return () => { active = false; };
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f0e6] p-4 text-[#3d291f]">
      <section className="w-full max-w-md rounded-3xl border border-[#dfd0bd] bg-white p-7 text-center shadow-xl">
        {state.loading ? <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary-600" />
          : state.success ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            : <ShieldAlert className="mx-auto h-12 w-12 text-rose-600" />}
        <h1 className="mt-4 text-2xl font-black">{state.loading ? 'Activating supplier account' : state.success ? 'Account activated' : 'Activation unavailable'}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{state.loading ? 'Please wait while Pawzzle validates your secure invitation.' : state.message}</p>
        {!state.loading && (
          <Link to="/login" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#5b3825] px-6 py-3 text-sm font-bold text-white hover:bg-[#432719]">
            Continue to Login
          </Link>
        )}
      </section>
    </main>
  );
};

export default SupplierActivation;
