import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LogisticsDetail from './LogisticsDetail';
import { logisticsService, staffService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  getImageUrl: value => value,
  logisticsService: { getDelivery: jest.fn() },
  staffService: { getEligibleRiders: jest.fn() },
  deliveryService: { assignRider: jest.fn(), submitStoreConcern: jest.fn() }
}));
jest.mock('../../hooks/useRealTimeUpdates', () => ({ useRealTimeUpdates: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('leaflet', () => ({ divIcon: jest.fn(() => ({})) }));
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  TileLayer: () => null
}));
jest.mock('../../components/delivery/DeliveryAssignmentFields', () => () => <div>Assignment fields</div>);
jest.mock('../../components/delivery/DeliveryConcernForm', () => () => <div>Concern form</div>);
jest.mock('../../components/ui/ConfirmationDialog', () => () => null);

const deliveryId = '6ad1789314c8cb29587cd497';
const storeId = '507f1f77bcf86cd799439011';
const delivery = {
  _id: deliveryId,
  store: { _id: storeId, name: 'Owner Store', contactInfo: { address: { formattedAddress: 'Store pickup' } } },
  deliveryNumber: 'DLV-87CD497', sourceType: 'manual', status: 'pending', statusLabel: 'Pending Assignment',
  assignmentType: 'unassigned', linkStatus: 'not_generated', createdAt: '2026-10-16T01:00:00.000Z',
  parcel: { parcelCount: 1 }, statusHistory: [], deliveryAttempts: [], complaints: [],
  manualDelivery: {
    recipientName: 'Demo Recipient', recipientPhone: '09170000000',
    pickupAddress: { formattedAddress: 'Store pickup' },
    dropoffAddress: { formattedAddress: 'Customer destination' }
  }
};

const renderPage = (id = deliveryId) => render(
  <MemoryRouter initialEntries={[`/admin/logistics/${id}`]}>
    <Routes><Route path="/admin/logistics/:id" element={<LogisticsDetail/>}/></Routes>
  </MemoryRouter>
);

beforeEach(() => {
  jest.clearAllMocks();
  logisticsService.getDelivery.mockResolvedValue({ data: { delivery } });
  staffService.getEligibleRiders.mockResolvedValue({ data: { riders: [], assignmentReadiness: { message: 'Ready.' } } });
});

test('uses the Delivery route id and sends a populated Store as its scalar ObjectId', async () => {
  renderPage();
  expect(await screen.findByText('DLV-87CD497')).toBeInTheDocument();
  expect(logisticsService.getDelivery).toHaveBeenCalledWith(deliveryId);
  expect(staffService.getEligibleRiders).toHaveBeenCalledWith({ storeId });
});

test('keeps an authorized delivery visible when the secondary Rider lookup fails', async () => {
  staffService.getEligibleRiders.mockRejectedValue({ response: { status: 403, data: { message: 'Store access denied.' } } });
  renderPage();
  expect(await screen.findByText('DLV-87CD497')).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent(/Delivery details loaded, but Rider eligibility could not be refreshed/i);
});

test('shows a clear error state for a missing or unauthorized Delivery id', async () => {
  logisticsService.getDelivery.mockRejectedValue({ response: { status: 404, data: { message: 'Delivery not found.' } } });
  renderPage('not-a-delivery-id');
  expect(await screen.findByRole('heading', { name: 'Unable to open delivery' })).toBeInTheDocument();
  expect(screen.getByText(/not found or is not available to your Store/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  await waitFor(() => expect(logisticsService.getDelivery).toHaveBeenCalledWith('not-a-delivery-id'));
  expect(staffService.getEligibleRiders).not.toHaveBeenCalled();
});
