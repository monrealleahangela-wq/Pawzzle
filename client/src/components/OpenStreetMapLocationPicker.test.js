import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OpenStreetMapLocationPicker from './OpenStreetMapLocationPicker';
import storeApplicationService from '../services/storeApplicationService';

jest.mock('../services/storeApplicationService', () => ({
  __esModule: true,
  default: {
    searchStoreLocations: jest.fn(),
    reverseStoreLocation: jest.fn()
  }
}));

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  Marker: () => <div data-testid="store-marker" />,
  TileLayer: ({ url, attribution }) => <div data-testid="map-tiles" data-url={url}>{attribution}</div>,
  useMap: () => ({ setView: jest.fn() }),
  useMapEvents: () => ({})
}));

jest.mock('leaflet', () => ({
  __esModule: true,
  default: { icon: jest.fn(() => ({})) }
}));

beforeEach(() => {
  jest.clearAllMocks();
});

test('searches Cavite through the free map service and confirms the selected pin', async () => {
  const onLocationSelected = jest.fn();
  const location = {
    lat: 14.4297,
    lng: 120.9367,
    full: 'Aguinaldo Highway, Imus, Cavite, Philippines',
    street: 'Aguinaldo Highway',
    barangay: 'Anabu I-A',
    city: 'Imus',
    province: 'Cavite',
    zipCode: '4103'
  };
  storeApplicationService.searchStoreLocations.mockResolvedValue({ data: { locations: [location] } });

  render(<OpenStreetMapLocationPicker onLocationSelected={onLocationSelected} />);
  fireEvent.change(screen.getByLabelText(/search store address/i), { target: { value: 'Aguinaldo Highway, Imus' } });
  fireEvent.click(screen.getByRole('button', { name: /^search$/i }));

  await waitFor(() => expect(storeApplicationService.searchStoreLocations).toHaveBeenCalledWith('Aguinaldo Highway, Imus'));
  expect(await screen.findByText(/pin ready/i)).toBeInTheDocument();
  expect(screen.getByTestId('map-tiles')).toHaveAttribute('data-url', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  expect(screen.getByText(/no paid map key is required/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /confirm location/i }));
  expect(onLocationSelected).toHaveBeenCalledWith(location);
});

test('keeps manual pinning available when an address cannot be found', async () => {
  storeApplicationService.searchStoreLocations.mockResolvedValue({ data: { locations: [] } });
  render(<OpenStreetMapLocationPicker onLocationSelected={jest.fn()} />);

  fireEvent.change(screen.getByLabelText(/search store address/i), { target: { value: 'Unknown Cavite place' } });
  fireEvent.click(screen.getByRole('button', { name: /^search$/i }));

  expect(await screen.findByText(/no matching Cavite address was found/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /confirm location/i })).toBeDisabled();
  expect(screen.getByRole('application', { name: /OpenStreetMap/i })).toBeVisible();
});
