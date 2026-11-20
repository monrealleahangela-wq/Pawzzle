import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SpecializedStaffVerification from './SpecializedStaffVerification';
import { staffService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  getImageUrl: value => value,
  staffService: {
    getProfessionalVerifications: jest.fn(),
    updateCredentialVerification: jest.fn(),
    updateProfessionalVerification: jest.fn()
  }
}));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const veterinarianWithVerifiedCertification = {
  _id: 'vet-1',
  firstName: 'Vet',
  lastName: 'Arlyn',
  role: 'staff',
  staffType: 'veterinarian',
  professionalVerificationStatus: 'pending_verification',
  store: { name: 'Pawzzle' },
  professionalProfile: {
    staffId: 'STF-0020',
    specialty: 'Veterinarian',
    experienceYears: 2,
    credentialDocuments: [{
      _id: 'credential-1',
      name: 'Cert',
      documentType: 'certification',
      documentUrl: '/credential.jpg',
      status: 'verified',
      expiresAt: '2030-01-01T00:00:00.000Z'
    }]
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  staffService.getProfessionalVerifications.mockResolvedValue({ data: { specialists: [veterinarianWithVerifiedCertification] } });
  staffService.updateProfessionalVerification.mockResolvedValue({ data: { specialist: {} } });
});

test('platform admin can approve a veterinarian after verifying a current certification', async () => {
  render(<SpecializedStaffVerification />);
  const approve = await screen.findByRole('button', { name: 'Approve Professional Access' });
  expect(approve).toBeEnabled();

  fireEvent.click(approve);

  await waitFor(() => expect(staffService.updateProfessionalVerification).toHaveBeenCalledWith('vet-1', {
    status: 'verified',
    notes: ''
  }));
  await waitFor(() => expect(staffService.getProfessionalVerifications).toHaveBeenCalledTimes(2));
});
