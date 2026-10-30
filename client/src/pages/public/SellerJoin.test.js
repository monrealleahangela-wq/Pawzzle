import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SellerJoin from './SellerJoin';
import authService from '../../services/authService';

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
  expect(screen.getByPlaceholderText(/enter your first name/i)).toHaveClass('input-premium');
  expect(screen.getByPlaceholderText(/create a secure password/i)).toHaveClass('store-field-with-action');
});

test('new seller account proceeds from account details to email verification', async () => {
  render(<MemoryRouter><SellerJoin /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Store' } });
  fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Owner' } });
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'owner@example.com' } });
  fireEvent.change(screen.getByPlaceholderText(/create a secure password/i), { target: { value: 'SecurePass123!' } });
  fireEvent.change(screen.getByPlaceholderText(/same password again/i), { target: { value: 'SecurePass123!' } });
  fireEvent.click(screen.getByRole('button', { name: /create account & verify email/i }));

  await waitFor(() => expect(authService.sendRegisterOTP).toHaveBeenCalledWith({
    firstName: 'Store', lastName: 'Owner', email: 'owner@example.com', password: 'SecurePass123!'
  }));
  expect(await screen.findByRole('heading', { name: /verify your email address/i })).toBeVisible();
  expect(screen.getAllByLabelText(/verification digit/i)).toHaveLength(6);
});
