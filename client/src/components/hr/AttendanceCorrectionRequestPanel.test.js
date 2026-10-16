import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AttendanceCorrectionRequestPanel from './AttendanceCorrectionRequestPanel';
import { hrService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  hrService: { requestAttendanceCorrection: jest.fn() }
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const incomplete = {
  _id: 'attendance-a', workDate: '2026-10-15', status: 'incomplete',
  timeIn: { at: '2026-10-15T01:00:00.000Z' }
};

test('employee submits a proposed clock-out with reason and mandatory evidence', async () => {
  const onSubmitted = jest.fn();
  hrService.requestAttendanceCorrection.mockResolvedValue({ data: { message: 'Submitted.' } });
  render(<AttendanceCorrectionRequestPanel records={[incomplete]} requests={[]} onSubmitted={onSubmitted} />);

  fireEvent.change(screen.getByRole('combobox', { name: /Incomplete attendance session/i }), { target: { value: 'attendance-a' } });
  fireEvent.change(screen.getByLabelText('Proposed clock-out'), { target: { value: '2026-10-15T17:00' } });
  fireEvent.change(screen.getByLabelText('Explanation'), { target: { value: 'I forgot to clock out after completing closing duties.' } });
  const file = new File(['image-data'], 'proof.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByLabelText(/Supporting evidence/i), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }));

  await waitFor(() => expect(hrService.requestAttendanceCorrection).toHaveBeenCalledTimes(1));
  const body = hrService.requestAttendanceCorrection.mock.calls[0][0];
  expect(body.get('attendanceId')).toBe('attendance-a');
  expect(body.get('reasonCategory')).toBe('forgot_before_leaving');
  expect(body.get('evidence')).toBe(file);
  await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
});

test('pending request disables a duplicate attendance selection and shows rejection reasons', () => {
  render(<AttendanceCorrectionRequestPanel records={[incomplete]} requests={[
    { _id: 'pending-a', attendance: 'attendance-a', workDate: '2026-10-15', proposedTimeOut: '2026-10-15T09:00:00Z', reason: 'Pending detailed reason', status: 'pending' },
    { _id: 'rejected-a', attendance: 'attendance-b', workDate: '2026-10-14', proposedTimeOut: '2026-10-14T09:00:00Z', reason: 'Rejected detailed reason', status: 'rejected', rejectionReason: 'Evidence did not establish departure time.' }
  ]} />);
  expect(screen.getByRole('option', { name: /pending review/i })).toBeDisabled();
  expect(screen.getByText(/Evidence did not establish departure time/)).toBeInTheDocument();
});
