import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import ServiceDetail from './ServiceDetail';
import { serviceService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  serviceService: { getServiceById: jest.fn() },
  getImageUrl: value => value
}));

const renderDetail = () => render(
  <MemoryRouter initialEntries={['/services/507f1f77bcf86cd799439011']}>
    <Routes>
      <Route path="/services/:id" element={<ServiceDetail />} />
    </Routes>
  </MemoryRouter>
);

describe('customer service detail', () => {
  afterEach(() => jest.clearAllMocks());

  test('renders an active service with no optional image and links to booking', async () => {
    serviceService.getServiceById.mockResolvedValue({ data: {
      _id: '507f1f77bcf86cd799439011',
      name: 'Veterinary Consultation',
      description: 'A customer-safe description.',
      category: 'health_wellness',
      price: 500,
      duration: 60,
      images: [],
      isActive: true,
      store: { _id: '507f191e810c19729de860ea', name: 'Pawzzle', contactInfo: { address: { city: 'Imus' } } }
    } });

    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Veterinary Consultation' })).toBeInTheDocument();
    expect(screen.getByLabelText('No service image')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request an appointment/i })).toHaveAttribute(
      'href',
      '/bookings?service=507f1f77bcf86cd799439011'
    );
  });

  test('shows an actionable fallback when the service request fails', async () => {
    serviceService.getServiceById.mockRejectedValue({ response: { status: 404 } });
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Service unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to services/i })).toHaveAttribute('href', '/services');
    await waitFor(() => expect(serviceService.getServiceById).toHaveBeenCalledTimes(1));
  });

  test('normalizes a legacy service and an ID-only store without crashing', async () => {
    serviceService.getServiceById.mockResolvedValue({ data: {
      id: '507f1f77bcf86cd799439011',
      title: 'Legacy Grooming Visit',
      category: { name: 'grooming' },
      basePrice: '650',
      duration: { value: '90' },
      store: '507f191e810c19729de860ea'
    } });

    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Legacy Grooming Visit' })).toBeInTheDocument();
    expect(screen.getByText('Store information unavailable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request an appointment/i })).toHaveAttribute(
      'href',
      '/bookings?service=507f1f77bcf86cd799439011'
    );
  });

  test('does not render a booking action for an inactive service response', async () => {
    serviceService.getServiceById.mockResolvedValue({ data: {
      _id: '507f1f77bcf86cd799439011',
      name: 'Inactive Service',
      isActive: false,
      store: { _id: '507f191e810c19729de860ea', name: 'Pawzzle' }
    } });

    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Service unavailable' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /request an appointment/i })).not.toBeInTheDocument();
  });
});
