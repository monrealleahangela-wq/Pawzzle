import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import IdentityRegistrationFields from './IdentityRegistrationFields';

jest.mock('./LiveIdentitySelfieCapture', () => ({ value, onCapture }) => (
  <button type="button" onClick={() => onCapture(new File(['selfie'], 'identity-live-selfie-1.jpg', { type: 'image/jpeg' }))}>{value ? 'Selfie captured' : 'Capture live selfie'}</button>
));

const data = {
  firstName: '', middleName: '', lastName: '', phone: '', governmentIdType: '', biometricConsent: false,
  address: { street: '', barangay: '', city: '', province: '', zipCode: '', country: 'PH' }
};

test('collects the complete identity profile and discloses biometric processing', () => {
  render(<IdentityRegistrationFields formData={data} onChange={jest.fn()} onAddressChange={jest.fn()} governmentIdImage={null} onGovernmentIdImage={jest.fn()} selfieImage={null} onSelfieImage={jest.fn()} />);
  expect(screen.getByLabelText(/first name/i)).toBeRequired();
  expect(screen.getByLabelText(/middle name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/surname/i)).toBeRequired();
  expect(screen.getByLabelText(/contact number/i)).toBeRequired();
  expect(screen.getByLabelText(/government id type/i)).toBeRequired();
  expect(screen.getByText(/aws rekognition/i)).toBeInTheDocument();
  expect(screen.getByText(/selfie is discarded/i)).toBeInTheDocument();
});

test('rejects an oversized government ID before registration', () => {
  const onGovernmentIdImage = jest.fn();
  const onFileError = jest.fn();
  render(<IdentityRegistrationFields formData={data} onChange={jest.fn()} onAddressChange={jest.fn()} governmentIdImage={null} onGovernmentIdImage={onGovernmentIdImage} selfieImage={null} onSelfieImage={jest.fn()} onFileError={onFileError} />);
  const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText(/government id image/i), { target: { files: [file] } });
  expect(onGovernmentIdImage).not.toHaveBeenCalled();
  expect(onFileError).toHaveBeenCalledWith(expect.stringMatching(/no larger than 5 mb/i));
});

test('shows document type confirmation and mismatch messages', () => {
  const { rerender } = render(<IdentityRegistrationFields formData={data} onChange={jest.fn()} onAddressChange={jest.fn()} governmentIdImage={null} onGovernmentIdImage={jest.fn()} selfieImage={null} onSelfieImage={jest.fn()} documentReview={{ status: 'matched', message: 'Philippine passport confirmed.' }} />);
  expect(screen.getByRole('status')).toHaveTextContent('Philippine passport confirmed.');
  rerender(<IdentityRegistrationFields formData={data} onChange={jest.fn()} onAddressChange={jest.fn()} governmentIdImage={null} onGovernmentIdImage={jest.fn()} selfieImage={null} onSelfieImage={jest.fn()} documentReview={{ status: 'error', message: 'The attached image appears to be a driver\'s license.' }} />);
  expect(screen.getByRole('alert')).toHaveTextContent("appears to be a driver's license");
});

test('shows OCR outages as a non-blocking manual-entry status', () => {
  render(<IdentityRegistrationFields formData={data} onChange={jest.fn()} onAddressChange={jest.fn()} governmentIdImage={null} onGovernmentIdImage={jest.fn()} selfieImage={null} onSelfieImage={jest.fn()} documentReview={{ status: 'manual', message: 'Review the details you entered, then continue.' }} />);
  expect(screen.getByRole('status')).toHaveTextContent(/review the details you entered/i);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
