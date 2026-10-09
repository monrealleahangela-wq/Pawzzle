import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import PetListingFormModal from './PetListingFormModal';

jest.mock('../../services/apiService', () => ({ getImageUrl: value => value }));

const basePetForm = {
  name: 'Milo', species: 'dog', breed: 'Mixed', birthday: '2024-01-01',
  ageYears: 2, ageMonths: 0, gender: 'male', size: 'small', weight: '', color: '',
  description: 'A friendly individual pet with a documented history and care routine.',
  price: '5000', images: ['/milo.jpg'], status: 'available', vaccinationStatus: 'none',
  vetRecords: [], temperament: '', temperamentTraits: ['calm'], activityLevel: 'low',
  careNeeds: { maintenance: 'unknown', grooming: 'unknown', training: 'unknown' },
  petCompatibility: { dogs: 'unknown', cats: 'unknown', otherPets: 'unknown' },
  dewormed: false, spayedNeutered: false, healthCondition: 'healthy', healthNotes: '',
  availabilityNotes: '', isNegotiable: false, paymentConfig: 'full_payment',
  depositAmount: 0, pickupAvailability: 'scheduled', pickupInstructions: '',
  permits: [], proofOfOwnership: [], supportingDocuments: [],
  pcciRegistration: { status: 'not_sure', registrationNumber: '', certificateUrl: '', informationStatus: 'not_provided' }
};

const Harness = ({ editingPet = null }) => {
  const [petForm, setPetForm] = useState({ ...basePetForm, status: editingPet?.status || 'available' });
  return <PetListingFormModal
    editingPet={editingPet}
    petForm={petForm}
    setPetForm={setPetForm}
    loading={false}
    onClose={jest.fn()}
    onSubmit={event => event.preventDefault()}
    onImageUpload={jest.fn()}
    onDocumentUpload={jest.fn()}
  />;
};

test('Add Pet omits manual availability while Edit Pet shows lifecycle status read-only', () => {
  const { unmount } = render(<Harness />);

  expect(screen.queryByRole('combobox', { name: /^Availability/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('status', { name: 'Pet lifecycle status' })).not.toBeInTheDocument();

  unmount();
  render(<Harness editingPet={{ _id: 'pet-1', status: 'reserved', listingType: 'sale' }} />);

  expect(screen.queryByRole('combobox', { name: /^Availability/i })).not.toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Pet lifecycle status' })).toHaveTextContent('reserved');
  expect(screen.getByText(/Updated automatically by reservation, purchase, and release events/i)).toBeInTheDocument();
});
