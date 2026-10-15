import React from 'react';
import { useSearchParams } from 'react-router-dom';
import PetInquiryBoard from '../../components/pets/PetInquiryBoard';

const StorePetInquiries = () => {
  const [params] = useSearchParams();
  return <main className="mx-auto max-w-6xl p-4 sm:p-6"><PetInquiryBoard mode="seller" focusId={params.get('id')} /></main>;
};

export default StorePetInquiries;
