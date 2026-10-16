import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AttendanceCorrectionReviewPanel from './AttendanceCorrectionReviewPanel';
import { hrService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  hrService: { getAttendanceCorrectionEvidence: jest.fn(), reviewAttendanceCorrection: jest.fn() }
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const request = {
  _id: 'request-a', workDate: '2026-10-15', status: 'pending',
  employee: { firstName: 'Eli', lastName: 'Employee' },
  originalTimeIn: '2026-10-15T01:00:00Z', proposedTimeOut: '2026-10-15T09:00:00Z',
  submittedAt: '2026-10-16T01:00:00Z', reason: 'Forgot to clock out after closing duties.'
};

beforeEach(() => {
  jest.clearAllMocks();
  window.prompt = jest.fn(() => 'Manager verified the supporting evidence.');
  window.confirm = jest.fn(() => true);
  window.open = jest.fn();
});

test('authorized reviewer opens private evidence and explicitly confirms approval', async () => {
  const onChanged = jest.fn();
  hrService.getAttendanceCorrectionEvidence.mockResolvedValue({ data: { url: 'signed-private-url', expiresAt: '2026-10-16T01:05:00Z' } });
  hrService.reviewAttendanceCorrection.mockResolvedValue({ data: { message: 'Approved.' } });
  render(<AttendanceCorrectionReviewPanel requests={[request]} canReview onChanged={onChanged} />);

  fireEvent.click(screen.getByRole('button', { name: /View evidence/i }));
  await waitFor(() => expect(window.open).toHaveBeenCalledWith('signed-private-url', '_blank', 'noopener,noreferrer'));
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(hrService.reviewAttendanceCorrection).toHaveBeenCalledWith('request-a', {
    action: 'approve', reviewerNote: 'Manager verified the supporting evidence.'
  }));
  expect(window.confirm).toHaveBeenCalled();
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

test('read-only viewer sees request details but no review actions', () => {
  render(<AttendanceCorrectionReviewPanel requests={[request]} canReview={false} />);
  expect(screen.getByText('Eli Employee · 2026-10-15')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
});

test('empty state is clear', () => {
  render(<AttendanceCorrectionReviewPanel requests={[]} canReview />);
  expect(screen.getByText('No attendance correction requests.')).toBeInTheDocument();
});
