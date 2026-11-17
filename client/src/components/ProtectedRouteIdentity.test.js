import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

let mockAuthState;
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuthState }));

const renderProtected = () => render(
  <MemoryRouter initialEntries={['/orders']}>
    <Routes>
      <Route path="/orders" element={<ProtectedRoute><div>Protected orders</div></ProtectedRoute>} />
      <Route path="/identity-verification" element={<div>Identity verification required</div>} />
    </Routes>
  </MemoryRouter>
);

test('redirects authenticated legacy accounts to identity verification', () => {
  mockAuthState = {
    isAuthenticated: true,
    loading: false,
    user: { role: 'customer', identityVerificationStatus: null }
  };
  renderProtected();
  expect(screen.getByText('Identity verification required')).toBeVisible();
  expect(screen.queryByText('Protected orders')).not.toBeInTheDocument();
});

test('allows protected features after identity verification', () => {
  mockAuthState = {
    isAuthenticated: true,
    loading: false,
    user: { role: 'customer', identityVerificationStatus: 'verified' }
  };
  renderProtected();
  expect(screen.getByText('Protected orders')).toBeVisible();
});
