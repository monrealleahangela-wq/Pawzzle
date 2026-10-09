import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import ServiceFormModal from './ServiceFormModal';

jest.mock('../../services/apiService', () => ({ getImageUrl: value => value }));

const categories = [{ id: 'health_wellness', label: 'Health & Wellness', subServices: ['Veterinary Consultation'] }];
const form = {
  name: 'Veterinary Consultation',
  category: 'health_wellness',
  subCategory: 'Veterinary Consultation',
  description: 'A consultation for customer pets.',
  duration: 30,
  price: 500,
  images: ['/service.jpg'],
  assignedStaff: [],
  isActive: true
};
const props = {
  form,
  setForm: jest.fn(),
  categories,
  onClose: jest.fn(),
  onSubmit: jest.fn(event => event.preventDefault()),
  onImageUpload: jest.fn(),
  onAdvanced: jest.fn(),
  loading: false
};

test('shows an active direct-role Veterinarian in the Health & Wellness selector', () => {
  render(<ServiceFormModal {...props} staff={[{
    _id: 'vet-1', firstName: 'Ana', lastName: 'Reyes', role: 'veterinarian', isActive: true
  }]} />);

  expect(screen.getByRole('button', { name: /Ana Reyes Veterinarian/i })).toBeInTheDocument();
  expect(screen.queryByText(/No active qualified specialist/i)).not.toBeInTheDocument();
});

test('distinguishes loading, API error, and a genuine empty specialist result', () => {
  const { rerender } = render(<ServiceFormModal {...props} staff={[]} staffLoading />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading qualified staff');

  rerender(<ServiceFormModal {...props} staff={[]} staffError="Unable to load the Store staff directory." />);
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the Store staff directory');

  rerender(<ServiceFormModal {...props} staff={[]} />);
  expect(screen.getByText(/No active qualified specialist is currently available/i)).toBeInTheDocument();
});
