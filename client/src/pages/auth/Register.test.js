import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';
import authService from '../../services/authService';

jest.mock('../../services/authService', () => ({
  __esModule: true,
  default: {
    sendRegisterOTP: jest.fn(),
    verifyRegisterOTP: jest.fn(),
    resendRegisterOTP: jest.fn()
  }
}));

jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn()
  }
}));

const renderRegister = () => render(
  <MemoryRouter>
    <Register />
  </MemoryRouter>
);

describe('Register page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows a clear, accessible account creation form', () => {
    renderRegister();

    expect(screen.getByRole('heading', { name: 'Join Pawzzle' })).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Email address')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByText(/use at least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  test('allows password visibility to be controlled independently', () => {
    renderRegister();

    const password = screen.getByLabelText('Password');
    const confirmation = screen.getByLabelText('Confirm password');

    expect(password).toHaveAttribute('type', 'password');
    expect(confirmation).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(confirmation).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show confirmed password' }));
    expect(confirmation).toHaveAttribute('type', 'text');
  });

  test('keeps the existing email verification step after valid submission', async () => {
    authService.sendRegisterOTP.mockResolvedValue({ success: true, message: 'Code sent' });
    renderRegister();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'PawzzleUser' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secure123!' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Secure123!' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(authService.sendRegisterOTP).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Email verification code' })).toHaveClass('grid', 'grid-cols-6', 'min-w-0');
    expect(screen.getAllByLabelText(/verification digit/i)).toHaveLength(6);
    screen.getAllByLabelText(/verification digit/i).forEach(input => {
      expect(input).toHaveClass('w-full', 'min-w-0');
    });
  });
});
