import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ServiceFormModal from './ServiceFormModal';

const categories = [
  { id: 'grooming', label: 'Grooming', subServices: ['Bathing'] },
  { id: 'boarding_hotel', label: 'Pet Boarding / Pet Hotel', subServices: ['Pet Boarding'] },
  { id: 'home_services', label: 'Home Services', subServices: ['Home Visit'] }
];

const regularForm = {
  name: 'Bathing', category: 'grooming', subCategory: 'Bathing', description: 'Bath and dry.',
  duration: 30, bufferTime: 0, price: 500, isActive: true,
  pricingConfiguration: { pricingBasis: 'fixed', pricePerNight: 0, petSizePricingEnabled: false, petSizeRates: { small: 0, medium: 0, large: 0 }, minimumNights: 0, maximumNights: 0 },
  recommendationCriteria: { enabled: false }
};

const renderModal = (form = regularForm, setForm = jest.fn()) => render(<ServiceFormModal
  form={form}
  setForm={setForm}
  categories={categories}
  onClose={jest.fn()}
  onSubmit={jest.fn(event => event.preventDefault())}
  loading={false}
/>);

test('keeps only Primary Details and Price Rules while removing legacy sections and home services', () => {
  renderModal();
  expect(screen.getByText('Primary Details')).toBeInTheDocument();
  expect(screen.getByText('Price Rules / Configuration')).toBeInTheDocument();
  expect(screen.queryByText(/Advanced Options/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Add-ons/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/^Staff$/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/^Images$/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Home Services' })).not.toBeInTheDocument();
});

test('shows fixed service pricing for regular services', () => {
  renderModal();
  expect(screen.getByLabelText(/Service Price/)).toHaveValue(500);
  expect(screen.getByRole('button', { name: /Save Service/i })).toBeEnabled();
  expect(screen.queryByLabelText(/Price per Night/i)).not.toBeInTheDocument();
});

test('shows configurable per-night rates and stay limits for boarding services', () => {
  const boardingForm = {
    ...regularForm,
    category: 'boarding_hotel',
    subCategory: 'Pet Boarding',
    price: 450,
    pricingConfiguration: {
      pricingBasis: 'per_night', pricePerNight: 450, petSizePricingEnabled: false,
      petSizeRates: { small: 400, medium: 500, large: 600 }, minimumNights: 1, maximumNights: 10
    }
  };
  const setForm = jest.fn();
  renderModal(boardingForm, setForm);
  expect(screen.getByDisplayValue('Per Night')).toBeInTheDocument();
  expect(screen.getByLabelText(/Price per Night/)).toHaveValue(450);
  expect(screen.queryByLabelText(/^Duration/)).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Minimum Stay/)).toHaveValue(1);
  fireEvent.click(screen.getByRole('switch', { name: /Use pet size pricing/i }));
  const update = setForm.mock.calls.at(-1)[0];
  expect(update(boardingForm).pricingConfiguration.petSizePricingEnabled).toBe(true);
});
