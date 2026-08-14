import React from 'react';
import { Link } from 'react-router-dom';
import { Home, ArrowLeft, MapPinOff } from 'lucide-react';

const NotFound = () => {
  return (
    <main className="min-h-[70vh] flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mb-5">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><MapPinOff size={22} /></span>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Page unavailable</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">We couldn't find this page</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            The link may be outdated, or the page may not be available for your account.
          </p>
        </div>
        
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            to="/"
            className="btn btn-primary w-full flex items-center justify-center"
          >
            <Home className="h-4 w-4 mr-2" />
            Go Home
          </Link>
          
          <button
            onClick={() => window.history.back()}
            className="btn btn-outline w-full flex items-center justify-center"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </button>
        </div>
      </div>
    </main>
  );
};

export default NotFound;
