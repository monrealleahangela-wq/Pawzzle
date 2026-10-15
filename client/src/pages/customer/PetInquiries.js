import React from 'react';
import { useSearchParams } from 'react-router-dom';
import PetInquiryBoard from '../../components/pets/PetInquiryBoard';

const PetInquiries = () => {
  const [params] = useSearchParams();
  return <main className="mx-auto max-w-5xl p-4 sm:p-6"><PetInquiryBoard mode="customer" focusId={params.get('id')} /></main>;
};

export default PetInquiries;
