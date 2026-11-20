import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfessionalVerificationStatus from './ProfessionalVerificationStatus';
import { staffService } from '../../services/apiService';

const mockRefreshUserRole = jest.fn();
const mockLogout = jest.fn();

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      _id: 'vet-1',
      role: 'staff',
      staffType: 'veterinarian',
      identityVerificationStatus: 'verified',
      professionalVerificationStatus: 'pending_verification'
    },
    refreshUserRole: mockRefreshUserRole,
    logout: mockLogout
  })
}));

jest.mock('../../services/apiService', () => ({
  staffService: {
    getMyProfessionalProfile: jest.fn(),
    uploadMyCredential: jest.fn()
  }
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() }
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRefreshUserRole.mockResolvedValue({ roleChanged: false });
  staffService.getMyProfessionalProfile.mockResolvedValue({
    data: {
      staff: {
        professionalProfile: {
          verification: { status: 'pending_verification', isRequired: true },
          credentialDocuments: []
        }
      }
    }
  });
  staffService.uploadMyCredential.mockResolvedValue({
    data: {
      professionalProfile: {
        verification: { status: 'pending_verification', isRequired: true },
        credentialDocuments: [{ _id: 'credential-1', name: 'PRC License', status: 'pending_verification' }]
      }
    }
  });
});

test('identity-verified professionals can submit credentials before admin approval', async () => {
  render(<MemoryRouter><ProfessionalVerificationStatus /></MemoryRouter>);

  expect(await screen.findByText(/identity verification is complete/i)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /submit credentials/i }));
  fireEvent.change(screen.getByLabelText(/credential name/i), { target: { value: 'PRC License' } });
  const credentialFile = new File(['license'], 'prc-license.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText(/current credential file/i), { target: { files: [credentialFile] } });
  fireEvent.click(screen.getByRole('button', { name: /submit for review/i }));

  await waitFor(() => expect(staffService.uploadMyCredential).toHaveBeenCalledTimes(1));
  const submitted = staffService.uploadMyCredential.mock.calls[0][0];
  expect(submitted.get('documentType')).toBe('professional_license');
  expect(submitted.get('name')).toBe('PRC License');
  expect(submitted.get('document')).toBe(credentialFile);
  await waitFor(() => expect(mockRefreshUserRole).toHaveBeenCalledTimes(1));
});
