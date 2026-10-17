import React from 'react';
import { useSearchParams } from 'react-router-dom';
import PetInquiryBoard from '../../components/pets/PetInquiryBoard';
import PetPurchaseInquiryList from '../../components/pets/PetPurchaseInquiryList';

const PetInquiries = () => {
  const [params] = useSearchParams();
  return <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
    <header>
      <h1 className="text-3xl font-black tracking-tight text-slate-900">Pet Inquiries</h1>
      <p className="mt-1 text-sm text-slate-500">Track purchase requests, pet questions, Store responses, and their latest status.</p>
    </header>
    <PetPurchaseInquiryList />
    <PetInquiryBoard
      mode="customer"
      focusId={params.get('id')}
      title="Questions About Pets"
      description="Questions and seller responses that do not create a purchase request."
    />
  </main>;
};

export default PetInquiries;
