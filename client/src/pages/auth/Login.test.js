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

    expect(screen.getByLabelText('Email or Username')).toHaveAttribute('id', 'login-identifier');

    const password = screen.getByLabelText('Secret Key');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(password).toHaveAttribute('type', 'password');
    expect(password.parentElement).toHaveClass('input-container');
    expect(password).toHaveClass('input-with-both-icons');

    fireEvent.click(toggle);

    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });
});
