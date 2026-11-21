import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SellerJoin from './SellerJoin';
import authService from '../../services/authService';

jest.mock('../../components/auth/IdentityRegistrationFields', () => props => (
  <section aria-label="Verified personal identity">
    <label>First name *<input name="firstName" value={props.formData.firstName} onChange={props.onChange} /></label>
    <label>Surname *<input name="lastName" value={props.formData.lastName} onChange={props.onChange} /></label>
    <button type="button" onClick={() => props.onChange({ target: { name: 'governmentIdType', value: 'passport', type: 'select-one' } })}>Select passport</button>
    <button type="button" onClick={() => props.onGovernmentIdImage(new File(['id'], 'id.jpg', { type: 'image/jpeg' }))}>Attach valid government ID</button>
    <button type="button" onClick={() => props.onSelfieImage(new File(['selfie'], 'identity-live-selfie-1.jpg', { type: 'image/jpeg' }))}>Capture live selfie</button>
    <button type="button" onClick={() => props.onChange({ target: { name: 'biometricConsent', type: 'checkbox', checked: true } })}>Accept face-match consent</button>
    <span data-testid="id-document-status">{props.documentReview?.status}</span>
  </section>
));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, completeOAuthLogin: jest.fn() })
}));
jest.mock('../../services/authService', () => ({
  __esModule: true,
  default: { sendRegisterOTP: jest.fn(), verifyRegisterOTP: jest.fn(), resendRegisterOTP: jest.fn() }
}));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  authService.sendRegisterOTP.mockResolvedValue({ success: true });
});

test('seller join shows the canonical application journey without duplicating the business form', () => {
  render(<MemoryRouter><SellerJoin /></MemoryRouter>);

  expect(screen.getByRole('heading', { name: /build a trusted pet business/i })).toBeVisible();
  expect(screen.getAllByText(/dti or sec registration/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/same application used by existing pawzzle customers/i)).toBeVisible();
  expect(screen.queryByLabelText(/store name/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/submit your application/i)).not.toBeInTheDocument();
  expect(screen.getByRole('note')).toHaveTextContent(/fields marked required must be completed/i);
  expect(screen.getByText(/before you begin/i)).toHaveClass('!text-primary-200');
  expect(screen.getByRole('region', { name: /verified personal identity/i })).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/create a secure password/i)).toHaveClass('store-field-with-action');
  expect(screen.getByRole('heading', { name: /see pawzzle seller plans before you apply/i })).toBeVisible();
  expect(screen.getByText(/plan preview only/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: /choose starter|choose growth|choose professional/i })).not.toBeInTheDocument();
});

test('new seller account proceeds from account details to email verification', async () => {
  render(<MemoryRouter><SellerJoin /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Store' } });
  fireEvent.change(screen.getByLabelText(/surname/i), { target: { value: 'Owner' } });
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'owner@example.com' } });
  fireEvent.change(screen.getByPlaceholderText(/create a secure password/i), { target: { value: 'SecurePass123!' } });
  fireEvent.change(screen.getByPlaceholderText(/same password again/i), { target: { value: 'SecurePass123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Select passport' }));
  fireEvent.click(screen.getByRole('button', { name: 'Attach valid government ID' }));
  expect(authService.readGovernmentId).toBeUndefined();
  expect(screen.getByTestId('id-document-status')).toHaveTextContent('manual');
  fireEvent.click(screen.getByRole('button', { name: 'Capture live selfie' }));
  fireEvent.click(screen.getByRole('button', { name: 'Accept face-match consent' }));
  fireEvent.click(screen.getByRole('button', { name: /create account & verify email/i }));

  await waitFor(() => expect(authService.sendRegisterOTP).toHaveBeenCalledWith(expect.objectContaining({
    firstName: 'Store', lastName: 'Owner', email: 'owner@example.com', password: 'SecurePass123!', biometricConsent: true
  })));
  expect(await screen.findByRole('heading', { name: /verify your email address/i })).toBeVisible();
  expect(screen.getAllByLabelText(/verification digit/i)).toHaveLength(6);
});

test('seller application never opens when the government ID and live selfie do not match', async () => {
  authService.verifyRegisterOTP.mockRejectedValue({
    response: {
      data: {
        code: 'FACE_MATCH_FAILED',
        message: 'Your live selfie did not match the face on the government ID.'
      }
    }
  });
  render(<MemoryRouter><SellerJoin /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Store' } });
  fireEvent.change(screen.getByLabelText(/surname/i), { target: { value: 'Owner' } });
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'owner@example.com' } });
  fireEvent.change(screen.getByPlaceholderText(/create a secure password/i), { target: { value: 'SecurePass123!' } });
  fireEvent.change(screen.getByPlaceholderText(/same password again/i), { target: { value: 'SecurePass123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Select passport' }));
  fireEvent.click(screen.getByRole('button', { name: 'Attach valid government ID' }));
  fireEvent.click(screen.getByRole('button', { name: 'Capture live selfie' }));
  fireEvent.click(screen.getByRole('button', { name: 'Accept face-match consent' }));
  fireEvent.click(screen.getByRole('button', { name: /create account & verify email/i }));

  const digits = await screen.findAllByLabelText(/verification digit/i);
  '123456'.split('').forEach((digit, index) => fireEvent.change(digits[index], { target: { value: digit } }));
  fireEvent.click(screen.getByRole('button', { name: /verify & continue to application/i }));

  await waitFor(() => expect(authService.verifyRegisterOTP).toHaveBeenCalledTimes(1));
  expect(mockNavigate).not.toHaveBeenCalledWith('/account-upgrade', expect.anything());
  expect(screen.getByRole('heading', { name: /verify your email address/i })).toBeVisible();
});
