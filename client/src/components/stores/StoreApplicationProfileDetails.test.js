import React from 'react';
import { render, screen } from '@testing-library/react';
import StoreApplicationProfileDetails from './StoreApplicationProfileDetails';

test('renders persisted application information rather than temporary form state', () => {
  render(<StoreApplicationProfileDetails application={{
    status: 'under_review',
    businessName: 'Saved Pawzzle Store',
    registeredBusinessName: 'Saved Pawzzle Store OPC',
    businessType: 'pet_store',
    legalStructure: 'one_person_corporation',
    operationalModules: ['products', 'services'],
    businessRegistration: { certificateNumber: 'SEC-123' },
    contactInfo: {
      phone: '09171234567', email: 'saved@example.com',
      address: { street: 'Main Street', barangay: 'San Jose', city: 'Dasmarinas', province: 'Cavite', zipCode: '4114' }
    },
    representative: { fullName: 'Store Owner', role: 'Owner' },
    taxProfile: { birRegistrationStatus: 'registered', declaredTaxStatus: 'non_vat_registered' }
  }} />);

  expect(screen.getByText('Saved Pawzzle Store')).toBeTruthy();
  expect(screen.getByText('Saved Pawzzle Store OPC')).toBeTruthy();
  expect(screen.getByText(/Main Street, San Jose, Dasmarinas, Cavite, 4114/)).toBeTruthy();
  expect(screen.getByText('products, services')).toBeTruthy();
  expect(screen.getByText('under review')).toBeTruthy();
});
