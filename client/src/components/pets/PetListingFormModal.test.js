import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import PetListingFormModal from './PetListingFormModal';

jest.mock('../../services/apiService', () => ({ getImageUrl: value => value }));

const basePetForm = {
  name: 'Milo', species: 'dog', breed: 'Mixed', birthday: '2024-01-01',
  ageYears: 2, ageMonths: 0, gender: 'male', size: 'small', weight: '', color: '',
  description: 'A friendly individual pet with a documented history and care routine.',
  price: '5000', images: ['/milo.jpg'], status: 'available', vaccinationStatus: 'none',
  vetRecords: [], temperament: '', temperamentTraits: ['calm'], activityLevel: 'low',
  careNeeds: { maintenance: 'unknown', grooming: 'unknown', training: 'unknown' },
  petCompatibility: { dogs: 'unknown', cats: 'unknown', otherPets: 'unknown', children: 'unknown' },
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

test('Add Pet offers manual availability while committed lifecycle states lock the control', () => {
  const { unmount } = render(<Harness />);

  expect(screen.getByRole('combobox', { name: /^Availability/i })).toBeEnabled();

  unmount();
  render(<Harness editingPet={{ _id: 'pet-1', status: 'reserved', listingType: 'sale' }} />);

  expect(screen.getByRole('combobox', { name: /^Availability/i })).toBeDisabled();
  expect(screen.getByText(/Reserved, sold, and adopted states are controlled by transaction history/i)).toBeInTheDocument();
});

test('Home Details shows species-specific fields without guessing care requirements', () => {
  render(<Harness />);
  expect(screen.getByText(/Optional, seller-provided requirements/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Indoor living suitability/i)).toHaveValue('');
  expect(screen.queryByLabelText(/Minimum aquarium volume/i)).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('combobox', { name: /^Species/i }), { target: { value: 'bird' } });
  expect(screen.getByLabelText(/Enclosure length/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Flight or exercise space/i)).toBeInTheDocument();

  fireEvent.change(screen.getByRole('combobox', { name: /^Species/i }), { target: { value: 'fish' } });
  expect(screen.queryByLabelText(/Enclosure length/i)).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Minimum aquarium volume/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Water and environment/i)).toBeInTheDocument();

  fireEvent.change(screen.getByRole('combobox', { name: /^Species/i }), { target: { value: 'reptile' } });
  expect(screen.getByLabelText(/Minimum temperature/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Maximum humidity/i)).toBeInTheDocument();
});
