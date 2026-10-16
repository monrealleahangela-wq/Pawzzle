import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import FindShops from './FindShops';
import { storeService } from '../../services/apiService';

jest.mock('axios');
jest.mock('../../services/apiService', () => ({
  storeService: { getStoreLocations: jest.fn() },
  getImageUrl: value => value
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  Polyline: () => <div data-testid="route-line" />,
  useMap: () => ({ setView: jest.fn(), getZoom: () => 11 })
}));
jest.mock('leaflet', () => ({
  __esModule: true,
  default: {
    icon: jest.fn(() => ({})),
    divIcon: jest.fn(() => ({})),
    Marker: { prototype: { options: {} } }
  }
}));

const store = {
  _id: 'store-1',
  name: 'Pawzzle Bacoor',
  logo: '/logo.png',
  businessType: 'pet_store',
  verificationStatus: 'verified',
  contactInfo: {
    phone: '09950000000',
    email: 'store@example.test',
    address: {
      street: 'Diamond Street',
      barangay: 'Mambog I',
      city: 'Bacoor',
      coordinates: { lat: 14.412, lng: 120.974 }
    }
  }
};

const osrmResponse = {
  data: {
    code: 'Ok',
    routes: [{
      distance: 4200,
      duration: 600,
      geometry: { coordinates: [[120.95, 14.4], [120.974, 14.412]] },
      legs: [{ steps: [
        { distance: 250, name: 'Aguinaldo Highway', maneuver: { type: 'turn', modifier: 'left', location: [120.95, 14.4] } },
        { distance: 3950, name: 'Diamond Street', maneuver: { type: 'arrive', location: [120.974, 14.412] } }
      ] }]
    }]
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  storeService.getStoreLocations.mockResolvedValue({ data: { stores: [store] } });
  axios.get.mockResolvedValue(osrmResponse);
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: jest.fn(success => success({ coords: { latitude: 14.4, longitude: 120.95, accuracy: 8 } })),
      watchPosition: jest.fn(() => 0),
      clearWatch: jest.fn()
    }
  });
});

test('starts accurate guidance on the first click and renders OSRM maneuvers', async () => {
  const { unmount } = render(
    <MemoryRouter initialEntries={['/find-shops?store=store-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <FindShops />
    </MemoryRouter>
  );

  expect(await screen.findByTestId('shop-card-store-1')).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Get Directions' }));

  expect(await screen.findByText('Turn left onto Aguinaldo Highway')).toBeInTheDocument();
  expect(screen.getByText('In 250 m')).toBeInTheDocument();
  expect(screen.getByText('10 MIN')).toBeInTheDocument();
  expect(screen.queryByText('Initializing Guidance...')).not.toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/route/v1/driving/120.95,14.4;120.974,14.412'), expect.objectContaining({ timeout: 12000 }));

  unmount();
  expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(0);
});

test('keeps store results compact instead of stretching a card to the panel height', async () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <FindShops />
    </MemoryRouter>
  );

  const card = await screen.findByTestId('shop-card-store-1');
  expect(card).not.toHaveClass('h-full');
  expect(card).toHaveClass('p-3', 'rounded-xl');
  expect(screen.getByTestId('shop-gps-sidebar')).toHaveClass('lg:w-[min(20rem,34%)]');
});

test('does not invent guidance when the routing provider returns no route', async () => {
  axios.get.mockResolvedValueOnce({ data: { code: 'NoRoute', routes: [] } });
  render(
    <MemoryRouter initialEntries={['/find-shops?store=store-1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <FindShops />
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Get Directions' }));
  await waitFor(() => expect(axios.get).toHaveBeenCalled());
  expect(screen.queryByText('Turn left onto Aguinaldo Highway')).not.toBeInTheDocument();
});
