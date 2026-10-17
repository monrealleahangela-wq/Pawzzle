import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import SpecializedStaffProfileModal from './SpecializedStaffProfileModal';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'owner-1', role: 'store_owner' } })
}));

jest.mock('../../services/apiService', () => ({
  getImageUrl: value => value,
  staffService: { getProfile: jest.fn() }
}));

jest.mock('../../utils/pawzzleDialog', () => ({ pawzzleConfirm: jest.fn() }));

const profile = {
  staff: {
    _id: 'staff-1',
    firstName: 'Rhaine',
    lastName: 'Rivera',
    staffType: 'manager',
    staffStatus: 'active',
    store: { name: 'Pawzzle' },
    professionalProfile: {},
    assignedServices: []
  },
  activity: { upcoming: [], history: [], completed: 0, cancelled: 0 },
  performance: {},
  recentReviews: [],
  activityTimeline: []
};

test('staff profile is portaled with a visible close control', () => {
  const onClose = jest.fn();
  render(<SpecializedStaffProfileModal data={profile} onClose={onClose} />);

  const dialog = screen.getByRole('dialog', { name: 'Rhaine Rivera' });
  expect(dialog.closest('[data-modal-viewport="true"]').parentElement).toBe(document.body);
  expect(screen.getByRole('button', { name: 'Close staff profile' })).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Close staff profile' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('staff profile supports Escape close through the shared viewport', () => {
  const onClose = jest.fn();
  render(<SpecializedStaffProfileModal data={profile} onClose={onClose} />);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});
