import { useRef, useState } from 'react';
import authService from '../services/authService';
import { mergeGovernmentIdFields } from '../utils/governmentIdRegistration';

const useGovernmentIdDocument = ({ formData, setFormData }) => {
  const [governmentIdImage, setGovernmentIdImage] = useState(null);
  const [documentReview, setDocumentReview] = useState({ status: 'idle', message: '' });
  const requestVersion = useRef(0);

  const readDocument = async (file, selectedType) => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    if (!file) {
      setGovernmentIdImage(null);
      setDocumentReview({ status: 'idle', message: '' });
      return;
    }
    setGovernmentIdImage(file);
    if (!selectedType) {
      setDocumentReview({ status: 'error', message: 'Select the government ID type so Pawzzle can confirm the uploaded document.' });
      return;
    }

    setDocumentReview({ status: 'reading', message: 'Reading the ID and confirming its document type…', selectedType });
    const payload = new FormData();
    payload.append('governmentIdType', selectedType);
    payload.append('governmentIdImage', file);
    try {
      const result = await authService.readGovernmentId(payload);
      if (requestVersion.current !== version) return;
      setFormData(previous => mergeGovernmentIdFields(previous, result.fields));
      setDocumentReview({
        status: 'matched',
        selectedType,
        detectedTypeLabel: result.detectedTypeLabel,
        message: `${result.detectedTypeLabel} confirmed. Readable name and address details were filled in; review them before continuing.`
      });
    } catch (error) {
      if (requestVersion.current !== version) return;
      const code = error.response?.data?.code;
      const ocrUnavailable = error.response?.status === 503 && [
        'GOVERNMENT_ID_READING_NOT_CONFIGURED',
        'GOVERNMENT_ID_READING_UNAVAILABLE'
      ].includes(code);
      setDocumentReview({
        status: ocrUnavailable ? 'manual' : 'error',
        selectedType,
        message: ocrUnavailable
          ? 'Automatic ID reading is unavailable. Review the details you entered, then continue; your ID and live face match are still required.'
          : error.response?.data?.message || 'The ID could not be read. Upload a clear image showing the full document.'
      });
    }
  };

  const handleGovernmentIdImage = file => readDocument(file, formData.governmentIdType);
  const handleGovernmentIdType = selectedType => {
    setFormData(previous => ({ ...previous, governmentIdType: selectedType }));
    if (governmentIdImage) readDocument(governmentIdImage, selectedType);
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
