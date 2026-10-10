import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
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
  isActive: true,
  recommendationCriteria: { enabled: false, applicablePetTypes: ['any'] }
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

test('shows supported veterinary staffType specialists for compatible Health & Wellness services', () => {
  render(<ServiceFormModal {...props} form={{ ...form, name: 'Diagnostic Laboratory Test', subCategory: 'Laboratory Testing' }} staff={[{
    _id: 'nurse-1', firstName: 'Mia', lastName: 'Santos', role: 'staff', staffType: 'veterinary_nurse', isActive: true
  }, {
    _id: 'lab-1', firstName: 'Leo', lastName: 'Cruz', role: 'staff', staffType: 'veterinary_laboratory_technician', isActive: true
  }]} />);

  expect(screen.getByRole('button', { name: /Mia Santos Veterinary Nurse/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Leo Cruz Veterinary Laboratory Technician/i })).toBeInTheDocument();
});

test('distinguishes loading, API error, and a genuine empty specialist result', () => {
  const { rerender } = render(<ServiceFormModal {...props} staff={[]} staffLoading />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading qualified staff');

  rerender(<ServiceFormModal {...props} staff={[]} staffError="Unable to load the Store staff directory." />);
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the Store staff directory');

  rerender(<ServiceFormModal {...props} staff={[]} />);
  expect(screen.getByText(/No active qualified specialist is currently available/i)).toBeInTheDocument();
});

test('keeps Service Advisor participation an explicit seller opt-in in the compact form', () => {
  const setForm = jest.fn();
  render(<ServiceFormModal {...props} setForm={setForm} staff={[]} />);

  const optIn = screen.getByRole('switch', { name: /Include in Service Advisor recommendations/i });
  expect(optIn).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(optIn);

  const update = setForm.mock.calls.at(-1)[0];
  expect(update(form).recommendationCriteria).toEqual({ enabled: true, applicablePetTypes: ['any'] });
});
