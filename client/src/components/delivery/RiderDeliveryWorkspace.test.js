import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RiderDeliveryWorkspace from './RiderDeliveryWorkspace';

jest.mock('leaflet', () => ({
  divIcon: jest.fn(() => ({}))
}));

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="delivery-map">{children}</div>,
  Marker: () => null,
  TileLayer: () => null
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() }
}));

jest.mock('../../services/apiService', () => ({
  deliveryService: {
    uploadDeliveryProof: jest.fn(),
    completeDelivery: jest.fn(),
    reportFailedDelivery: jest.fn()
  }
}));

const makeDelivery = (status = 'in_transit') => ({
  _id: 'delivery-12345678',
  status,
  isLive: true,
  createdAt: '2026-10-10T02:00:00.000Z',
  parcel: { weightKg: 5, parcelCount: 1 },
  assignedRider: {
    riderProfile: {
      capacity: {
        configured: true,
        vehicleType: 'motorcycle',
        remainingWeightKg: 15,
        remainingParcelCount: 4,
        reservedWeightKg: 5,
        reservedParcelCount: 1
      }
    }
  },
  order: {
    orderNumber: 'ORD-1001',
    paymentMethod: 'online',
    customer: { firstName: 'Alex', lastName: 'Rivera', phone: '09171234567' },
    store: { name: 'Pawzzle Store' },
    shippingAddress: {
      street: '10 Pet Street',
      barangay: 'Central',
      city: 'Davao City',
      province: 'Davao del Sur'
    },
    items: [{ itemType: 'Product', quantity: 1 }]
  },
  statusHistory: [{ status, timestamp: '2026-10-10T02:00:00.000Z' }],
  chat: []
});

const renderWorkspace = (status = 'in_transit') => render(
  <RiderDeliveryWorkspace
    delivery={makeDelivery(status)}
    token="test-token"
    eta={12}
    distanceKm={3.5}
    onStatusUpdate={jest.fn()}
    onSendMessage={jest.fn()}
    onRefresh={jest.fn()}
  />
);

describe('RiderDeliveryWorkspace responsive action layout', () => {
  test('uses one shared responsive container for the header, content and bottom actions', () => {
    const { container } = renderWorkspace();

    const header = screen.getByTestId('rider-delivery-header-container');
    const content = screen.getByTestId('rider-delivery-content');
    const actions = screen.getByTestId('rider-delivery-action-container');

    [header, content, actions].forEach((element) => {
      expect(element).toHaveClass('max-w-5xl', 'w-full', 'px-4', 'sm:px-6', 'lg:px-8');
    });

    expect(screen.getByTestId('rider-delivery-action-bar')).toHaveClass(
      'fixed',
      'bottom-0',
      'lg:left-[var(--app-content-offset)]'
    );
    expect(container.querySelector('.rider-delivery-workspace')).toHaveClass(
      'pb-[calc(8rem+env(safe-area-inset-bottom))]',
      'sm:pb-[calc(7rem+env(safe-area-inset-bottom))]'
    );
  });

  test('keeps both in-transit action labels visible and accessible on narrow screens', () => {
    renderWorkspace('in_transit');

    const issueAction = screen.getByRole('button', { name: 'Report delivery issue' });
    expect(issueAction).toHaveTextContent('Report issue');
    expect(issueAction).toHaveClass('min-h-12', 'min-w-0');
    expect(screen.getByRole('button', { name: 'Arrived at location' })).toHaveClass('min-h-12', 'min-w-0');
    expect(screen.getByTestId('rider-delivery-action-container')).toHaveClass(
      'grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]',
      'sm:grid-cols-2'
    );
  });

  test('preserves the issue form and arrived-state confirmation actions', () => {
    const { rerender } = renderWorkspace('in_transit');

    fireEvent.click(screen.getByRole('button', { name: 'Report delivery issue' }));
    expect(screen.getByRole('dialog', { name: 'Report delivery issue' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close issue form' }));

    rerender(
      <RiderDeliveryWorkspace
        delivery={makeDelivery('arrived')}
        token="test-token"
        onStatusUpdate={jest.fn()}
        onSendMessage={jest.fn()}
        onRefresh={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Report delivery issue' })).toHaveTextContent('Report issue');
    expect(screen.getByRole('button', { name: 'Confirm delivery' })).toHaveClass('min-h-12', 'min-w-0');
  });
});
