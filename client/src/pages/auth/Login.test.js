import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ login: jest.fn(), verify2FA: jest.fn() })
}));

jest.mock('../../services/apiService', () => ({
  supportService: { createTicket: jest.fn() }
}));

jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), info: jest.fn(), success: jest.fn() }
}));

describe('Login form controls', () => {
  test('associates labels and toggles the contained password action accessibly', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Email or username')).toHaveAttribute('id', 'login-identifier');

    const password = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');

    fireEvent.click(toggle);

    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('presents clear sign-in and account creation actions', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
  });

  test('keeps dark-panel copy explicitly readable over the branded background', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Everything your pet needs, in one trusted place.' }))
      .toHaveClass('!text-white');
    expect(screen.getByText('Verified community')).toHaveClass('!text-white');
    expect(screen.getByText('Trusted accounts and reviewed stores')).toHaveClass('!text-[#cdb8aa]');
  });
});
