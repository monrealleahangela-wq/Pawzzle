import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Services from './Services';
import { serviceService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  serviceService: { getAllServices: jest.fn() },
  getImageUrl: value => value
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'customer' }, isAuthenticated: true })
}));
jest.mock('../../constants/locationConstants', () => ({
  getCitiesByProvince: () => [{ value: 'bacoor', label: 'Bacoor' }]
}));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), info: jest.fn(), success: jest.fn() }
}));

const service = {
  _id: 'service-1',
  name: 'Gentle Grooming',
  category: 'grooming',
  subCategory: 'Bathing & Drying',
  description: 'A calm, complete grooming session for your pet.',
  price: 650,
  duration: 60,
  homeServiceAvailable: false,
  images: ['/service.jpg'],
  ratings: { average: 4.8, count: 12 },
  store: {
    _id: 'store-1',
    name: 'Pawzzle Care',
    contactInfo: { address: { city: 'Bacoor', coordinates: { lat: 14.4, lng: 120.9 } } }
  }
};

const renderServices = () => render(
  <MemoryRouter initialEntries={['/services']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/services" element={<Services />} />
      <Route path="/services/:id" element={<div>Service detail destination</div>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  serviceService.getAllServices.mockReset();
  serviceService.getAllServices.mockResolvedValue({ data: { services: [service] } });
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: jest.fn(success => success({
        coords: { latitude: 14.4, longitude: 120.9 }
      }))
    }
  });
});

test('Services keeps compact accessible filters and existing customer navigation', async () => {
  renderServices();

  expect(await screen.findByRole('heading', { name: 'Professional Services' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Search services' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Filter services by region' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'All Services' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Grooming' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Near Me' })).toHaveAttribute('aria-pressed', 'false');

  fireEvent.change(screen.getByRole('textbox', { name: 'Search services' }), {
    target: { value: 'gentle' }
  });
  await waitFor(() => expect(serviceService.getAllServices).toHaveBeenLastCalledWith(
    expect.objectContaining({ search: 'gentle' })
  ));

  fireEvent.click(screen.getByRole('button', { name: 'Grooming' }));
  await waitFor(() => expect(serviceService.getAllServices).toHaveBeenLastCalledWith(
    expect.objectContaining({ category: 'grooming', search: 'gentle' })
  ));

  fireEvent.change(screen.getByRole('combobox', { name: 'Filter services by region' }), {
    target: { value: 'bacoor' }
  });
  await waitFor(() => expect(serviceService.getAllServices).toHaveBeenLastCalledWith(
    expect.objectContaining({ category: 'grooming', city: 'bacoor', search: 'gentle' })
  ));

  fireEvent.click(screen.getByRole('button', { name: 'Near Me' }));
  expect(await screen.findByRole('button', { name: 'GPS Active' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('link', { name: /Pawzzle Care/i })).toHaveAttribute('href', '/stores/store-1');

  fireEvent.click(screen.getByRole('button', { name: 'View Gentle Grooming' }));
  expect(await screen.findByText('Service detail destination')).toBeInTheDocument();
});
