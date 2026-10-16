import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Logistics from './Logistics';
import { logisticsService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  getImageUrl: value => value,
  logisticsService: {
    getDashboard: jest.fn(), getDeliveries: jest.fn(), getIssues: jest.fn(),
    resolveIssue: jest.fn(), createManualDelivery: jest.fn(), updateManualDelivery: jest.fn()
  },
  staffService: { getEligibleRiders: jest.fn() }
}));
jest.mock('../../hooks/useRealTimeUpdates', () => ({ useRealTimeUpdates: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const manual = {
  _id: '507f1f77bcf86cd799439011', deliveryNumber: 'DLV-99439011', sourceType: 'manual',
  manualDelivery: {
    recipientName: 'Demo Recipient', recipientPhone: '09170000000',
    pickupAddress: { formattedAddress: 'Saved pickup address' },
    dropoffAddress: { formattedAddress: 'Saved destination address' }
  },
  status: 'pending', statusLabel: 'Pending Assignment', assignmentType: 'unassigned',
  linkStatus: 'not_generated', createdAt: '2026-10-16T01:00:00.000Z'
};

beforeEach(() => {
  jest.clearAllMocks();
  logisticsService.getDashboard.mockResolvedValue({ data: {
    summary: { total: 1, pendingAssignment: 1, assigned: 0, outForDelivery: 0, arrived: 0, delivered: 0, failed: 0, activeInternalRiders: 0 },
    charts: { deliveriesOverTime: [], performance: { completed: 0, failed: 0 }, byAssignment: [] }
  } });
  logisticsService.getDeliveries.mockResolvedValue({ data: {
    deliveries: [manual], pagination: { page: 1, pages: 4, total: 76 }
  } });
  logisticsService.getIssues.mockResolvedValue({ data: { issues: [] } });
  require('../../services/apiService').staffService.getEligibleRiders.mockResolvedValue({ data: { riders: [] } });
});
test('renders manual deliveries and uses the full filtered total rather than page length', async () => {
  render(<MemoryRouter><Logistics/></MemoryRouter>);
  expect(await screen.findByText('Demo Recipient')).toBeInTheDocument();
  expect(screen.getByText('Saved destination address')).toBeInTheDocument();
  expect(screen.getByText('From: Saved pickup address')).toBeInTheDocument();
  expect(screen.getByText('76 delivery records')).toBeInTheDocument();
  expect(screen.getAllByText('Manual delivery')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Edit DLV-99439011' }));
  expect(await screen.findByRole('dialog', { name: 'Edit manual delivery' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /Drop-off address/i })).toHaveValue('Saved destination address');
});
test('applies identical status filters to dashboard summary and paginated rows', async () => {
  render(<MemoryRouter><Logistics/></MemoryRouter>);
  await screen.findByText('Demo Recipient');
  fireEvent.change(screen.getByRole('option', { name: 'All statuses' }).parentElement, { target: { value: 'delivered' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
  await waitFor(() => expect(logisticsService.getDashboard).toHaveBeenLastCalledWith({ status: 'delivered' }));
  expect(logisticsService.getDeliveries).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'delivered', page: 1, limit: 25 }));
});
