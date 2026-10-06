import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PetProfileFormModal from './PetProfileFormModal';

const initialPet = {
  name: 'Milo', type: 'dog', breed: 'Mixed', gender: 'Male', birthday: '2024-01-01',
  approximateAge: { value: '', unit: 'years' }, size: 'Unknown', weight: '', weightUnit: 'kg',
  vaccinationStatus: 'Not Yet Vaccinated', vaccinationCards: [null, null], photo: '/milo.jpg',
  coat: { length: 'unknown', type: 'unknown', condition: 'unknown', otherDescription: '' },
  serviceNeeds: [], servicePreferences: { preferredServiceType: '', preferredDuration: '', preferredFrequency: '', specialHandling: '' }
};

const Harness = () => {
  const [petForm, setPetForm] = useState(initialPet);
  return <PetProfileFormModal
    petForm={petForm}
    setPetForm={setPetForm}
    petPhotoPreview="/milo.jpg"
    setPetPhotoPreview={jest.fn()}
    vaccinationPreviews={[null, null]}
    setVaccinationPreviews={jest.fn()}
    breeds={[]}
    onClose={jest.fn()}
    onSubmit={event => event.preventDefault()}
    loading={false}
  />;
};

test('Pet Add/Edit exposes the shared Service Advisor attributes and preserves canonical values', () => {
  render(<Harness />);

  const species = screen.getByLabelText(/Species/);
  expect(within(species).getAllByRole('option').map(option => option.value)).toEqual(['dog', 'cat', 'bird', 'rabbit', 'hamster', 'other']);

  fireEvent.change(screen.getByLabelText(/Size/), { target: { value: 'Small' } });
  expect(screen.getByLabelText(/Size/)).toHaveValue('Small');
  fireEvent.change(screen.getByLabelText(/Coat Length/), { target: { value: 'short' } });
  fireEvent.change(screen.getByLabelText(/Coat Type/), { target: { value: 'straight' } });
  fireEvent.change(screen.getByLabelText(/Preferred Service/), { target: { value: 'grooming' } });

  expect(screen.getByLabelText(/Coat Length/)).toHaveValue('short');
  expect(screen.getByLabelText(/Coat Type/)).toHaveValue('straight');
  expect(screen.getByLabelText(/Preferred Service/)).toHaveValue('grooming');

  const bathing = screen.getByRole('button', { name: 'Bathing' });
  fireEvent.click(bathing);
  expect(bathing).toHaveAttribute('aria-pressed', 'true');
});
