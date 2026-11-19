import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import IdentityVerification from './IdentityVerification';
import authService from '../../services/authService';

const mockUpdateUser = jest.fn();
const mockLogout = jest.fn();
let mockAuthState;

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => mockAuthState }));
jest.mock('../../services/authService', () => ({
  __esModule: true,
  default: { verifyIdentity: jest.fn(), getCurrentUser: jest.fn() }
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn() } }));
jest.mock('../../components/auth/LiveIdentitySelfieCapture', () => ({ onCapture }) => (
  <button type="button" onClick={() => onCapture(new File(['selfie'], 'identity-live-selfie-1.jpg', { type: 'image/jpeg' }))}>Capture test selfie</button>
));

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState = {
    isAuthenticated: true,
    loading: false,
    user: { _id: 'user-1', role: 'customer', identityVerificationStatus: null },
    updateUser: mockUpdateUser,
    logout: mockLogout
  };
});

const renderPage = () => render(
  <MemoryRouter initialEntries={['/identity-verification']}>
    <Routes>
      <Route path="/identity-verification" element={<IdentityVerification />} />
      <Route path="/home" element={<div>Unlocked home</div>} />
      <Route path="/professional-verification" element={<div>Submit professional credentials</div>} />
      <Route path="/superadmin/dashboard" element={<div>Platform administration</div>} />
    </Routes>
  </MemoryRouter>
);

test('requires a government ID and live face match before unlocking the app', async () => {
  authService.verifyIdentity.mockResolvedValue({
    user: { _id: 'user-1', role: 'customer', identityVerificationStatus: 'verified' }
  });
  renderPage();

  fireEvent.change(screen.getByLabelText(/government id type/i), { target: { value: 'passport' } });
  const idImage = new File(['id'], 'passport.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByLabelText(/government id image/i), { target: { files: [idImage] } });
  fireEvent.click(screen.getByRole('button', { name: /capture test selfie/i }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /verify id and unlock pawzzle/i }));

  await waitFor(() => expect(authService.verifyIdentity).toHaveBeenCalledTimes(1));
  const submitted = authService.verifyIdentity.mock.calls[0][0];
  expect(submitted.get('governmentIdType')).toBe('passport');
  expect(submitted.get('biometricConsent')).toBe('true');
  expect(submitted.get('governmentIdImage')).toBe(idImage);
  expect(submitted.get('selfieImage').name).toMatch(/^identity-live-selfie-/);
  expect(await screen.findByText('Unlocked home')).toBeVisible();
  expect(mockUpdateUser).toHaveBeenCalledWith(expect.objectContaining({ identityVerificationStatus: 'verified' }));
});

test('already verified accounts cannot reopen the verification workflow', () => {
  mockAuthState.user.identityVerificationStatus = 'verified';
  renderPage();
  expect(screen.getByText('Unlocked home')).toBeVisible();
});

test('sends a pending care professional to credential submission after identity verification', async () => {
  mockAuthState.user = {
    _id: 'vet-1',
    role: 'staff',
    staffType: 'veterinarian',
    identityVerificationStatus: null,
    professionalVerificationStatus: 'pending_verification'
  };
  authService.verifyIdentity.mockResolvedValue({
    user: { ...mockAuthState.user, identityVerificationStatus: 'verified' }
  });
  renderPage();

  fireEvent.change(screen.getByLabelText(/government id type/i), { target: { value: 'passport' } });
  fireEvent.change(screen.getByLabelText(/government id image/i), {
    target: { files: [new File(['id'], 'passport.jpg', { type: 'image/jpeg' })] }
  });
  fireEvent.click(screen.getByRole('button', { name: /capture test selfie/i }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /verify id and unlock pawzzle/i }));

  expect(await screen.findByText('Submit professional credentials')).toBeVisible();
  expect(mockUpdateUser).toHaveBeenCalledWith(expect.objectContaining({
    identityVerificationStatus: 'verified',
    professionalVerificationStatus: 'pending_verification'
  }));
});

test.each(['super_admin', 'platform_admin'])(
  'redirects an unverified %s away from the identity workflow',
  role => {
    mockAuthState.user.role = role;
    renderPage();
    expect(screen.getByText('Platform administration')).toBeVisible();
    expect(screen.queryByText(/verify your identity to continue/i)).not.toBeInTheDocument();
  }
);

test('recovers a stale session when the server says the account is already verified', async () => {
  const verifiedUser = { _id: 'user-1', role: 'customer', identityVerificationStatus: 'verified' };
  authService.verifyIdentity.mockRejectedValue({
    response: { data: { code: 'IDENTITY_ALREADY_VERIFIED', message: 'This account is already identity verified.' } }
  });
  authService.getCurrentUser.mockResolvedValue({ user: verifiedUser });
  renderPage();

  fireEvent.change(screen.getByLabelText(/government id type/i), { target: { value: 'passport' } });
  fireEvent.change(screen.getByLabelText(/government id image/i), {
    target: { files: [new File(['id'], 'passport.jpg', { type: 'image/jpeg' })] }
  });
  fireEvent.click(screen.getByRole('button', { name: /capture test selfie/i }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /verify id and unlock pawzzle/i }));

  expect(await screen.findByText('Unlocked home')).toBeVisible();
  expect(authService.getCurrentUser).toHaveBeenCalledTimes(1);
  expect(mockUpdateUser).toHaveBeenCalledWith(verifiedUser);
});
