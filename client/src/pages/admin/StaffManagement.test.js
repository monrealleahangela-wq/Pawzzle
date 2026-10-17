import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StaffManagement from './StaffManagement';
import { staffService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  getImageUrl: value => value,
  staffService: {
    getAll: jest.fn(),
    getConfiguration: jest.fn()
  },
  uploadService: { uploadImage: jest.fn() }
}));

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'owner-1', role: 'store_owner' } })
}));

jest.mock('../../utils/authorization', () => ({ hasUiActionPermission: jest.fn(() => false) }));
jest.mock('../../components/admin/SpecializedStaffProfileModal', () => () => null);

beforeEach(() => {
  jest.clearAllMocks();
  const pendingRequest = new Promise(() => {});
  staffService.getAll.mockReturnValue(pendingRequest);
  staffService.getConfiguration.mockReturnValue(pendingRequest);
});

const renderPage = () => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <StaffManagement />
  </MemoryRouter>
);

test('staff form is portaled above the application shell with a visible close button', () => {
  renderPage();
  expect(staffService.getConfiguration).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Add Staff' }));

  const dialog = screen.getByRole('dialog', { name: /Add Staff/ });
  const viewport = dialog.closest('[data-modal-viewport="true"]');
  expect(viewport).toBeTruthy();
  expect(viewport.parentElement).toBe(document.body);
  expect(viewport).toHaveClass('fixed', 'inset-0', 'z-[1000]');
  expect(screen.getByRole('button', { name: 'Close staff form' })).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Close staff form' }));
  expect(screen.queryByRole('dialog', { name: /Add Staff/ })).not.toBeInTheDocument();
});

test('staff form closes with Escape through the shared modal behavior', () => {
  renderPage();
  expect(staffService.getConfiguration).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Add Staff' }));

  expect(screen.getByRole('button', { name: 'Close staff form' })).toBeVisible();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: /Add Staff/ })).not.toBeInTheDocument();
});
