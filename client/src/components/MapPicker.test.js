import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MapPicker from './MapPicker';

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() }
}));

jest.mock('react-leaflet', () => ({
  Circle: () => <div data-testid="gps-accuracy-circle" />,
  MapContainer: ({ children }) => <div>{children}</div>,
  Marker: () => <div data-testid="location-marker" />,
  TileLayer: () => null,
  useMap: () => ({ setView: jest.fn() }),
  useMapEvents: () => ({})
}));

jest.mock('leaflet', () => ({
  __esModule: true,
  default: {
    icon: jest.fn(() => ({})),
    Marker: { prototype: { options: {} } }
  }
}));

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      display_name: 'Diamond Street, Mambog I, Bacoor, Cavite',
      address: {
        road: 'Diamond Street',
        village: 'Mambog I',
        city: 'Bacoor',
        state: 'Cavite',
        postcode: '4102'
      }
    })
  });
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: jest.fn(success => {
        success({ coords: { latitude: 14.4, longitude: 120.9, accuracy: 95 }, timestamp: 1 });
        success({ coords: { latitude: 14.401, longitude: 120.901, accuracy: 18 }, timestamp: 2 });
        return 8;
      }),
      clearWatch: jest.fn()
    }
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

test('uses the best GPS reading, displays its uncertainty, and confirms exact coordinates', async () => {
  const onLocationSelected = jest.fn();
  render(<MapPicker onLocationSelected={onLocationSelected} />);

  fireEvent.click(screen.getByRole('button', { name: /use current location/i }));

  expect(await screen.findByText(/precise gps fix ±18 m/i)).toBeInTheDocument();
  expect(screen.getByTestId('gps-accuracy-circle')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

  await waitFor(() => expect(onLocationSelected).toHaveBeenCalledWith(expect.objectContaining({
    lat: 14.401,
    lng: 120.901,
    accuracyMeters: 18,
    locationSource: 'device_gps'
  })));
  expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(8);
});

test('centers a coarse GPS reading but requires explicit pin confirmation', async () => {
  const onLocationSelected = jest.fn();
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: jest.fn((success, error) => {
        success({ coords: { latitude: 14.4, longitude: 120.9, accuracy: 209 }, timestamp: 1 });
        error({ code: 2, message: 'No better reading available' });
        return 9;
      }),
      clearWatch: jest.fn()
    }
  });

  render(<MapPicker onLocationSelected={onLocationSelected} />);
  fireEvent.click(screen.getByRole('button', { name: /use current location/i }));

  expect(await screen.findByText(/approximate gps area/i)).toBeInTheDocument();
  expect(onLocationSelected).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: /confirm this pin/i }));
  await waitFor(() => expect(onLocationSelected).toHaveBeenCalledWith(expect.objectContaining({
    lat: 14.4,
    lng: 120.9,
    accuracyMeters: 209,
    locationSource: 'device_gps_approximate'
  })));
});
