import { useState } from 'react';

const useGovernmentIdDocument = ({ formData, setFormData }) => {
  const [governmentIdImage, setGovernmentIdImage] = useState(null);
  const [documentReview, setDocumentReview] = useState({ status: 'idle', message: '' });

  const acceptDocument = (file, selectedType) => {
    if (!file) {
      setGovernmentIdImage(null);
      setDocumentReview({ status: 'idle', message: '' });
      return;
    }
    setGovernmentIdImage(file);
    if (!selectedType) {
      setDocumentReview({ status: 'error', message: 'Select the government ID type that matches the attached image.' });
      return;
    }
    setDocumentReview({
      status: 'manual',
      selectedType,
      message: 'ID image attached. Review the personal details you entered, then continue to the required live face match.'
    });
  };

  const handleGovernmentIdImage = file => acceptDocument(file, formData.governmentIdType);
  const handleGovernmentIdType = selectedType => {
    setFormData(previous => ({ ...previous, governmentIdType: selectedType }));
    if (governmentIdImage) acceptDocument(governmentIdImage, selectedType);
    else setDocumentReview({ status: 'idle', message: '' });
  };

  return {
    governmentIdImage,
    documentReview,
    handleGovernmentIdImage,
    handleGovernmentIdType
  };
};

export default useGovernmentIdDocument;
