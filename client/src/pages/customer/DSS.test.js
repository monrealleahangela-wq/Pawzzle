import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CustomerDSS from './DSS';
import { dssService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  dssService: {
    getCustomerInsights: jest.fn(),
    getServiceRecommendations: jest.fn(),
    getPetRecommendations: jest.fn()
  },
  getImageUrl: value => value
}));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  dssService.getCustomerInsights.mockReset();
  dssService.getServiceRecommendations.mockReset();
  dssService.getCustomerInsights.mockResolvedValue({
    data: {
      myPets: [
        { _id: 'pet-1', name: 'Milo', type: 'dog', breed: 'Mixed' },
        { _id: 'pet-2', name: 'Luna', type: 'cat', breed: 'Domestic Shorthair' }
      ]
    }
  });
});

test('Service Advisor distinguishes incomplete profiles and ignores stale selected-Pet responses', async () => {
  const first = deferred();
  dssService.getServiceRecommendations.mockImplementation(({ petId }) => {
    if (petId === 'pet-1') return first.promise;
    return Promise.resolve({ data: {
      pet: { _id: 'pet-2', name: 'Luna' },
      recommendations: [],
      profileCompleteness: {
        complete: false,
        missingFields: [{ field: 'size', label: 'size' }]
      }
    } });
  });

  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><CustomerDSS /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('tab', { name: /Service Advisor/ }));

  const petSelect = await screen.findByLabelText('Pet to match');
  fireEvent.change(petSelect, { target: { value: 'pet-2' } });

  expect(await screen.findByText("Complete Luna's profile for more accurate recommendations.")).toBeInTheDocument();
  expect(screen.getByText('Add size. Services with requirements that cannot be verified are not shown.')).toBeInTheDocument();
  expect(screen.getByText('No recommendation can be confirmed from the currently recorded profile details.')).toBeInTheDocument();

  await act(async () => {
    first.resolve({ data: {
      pet: { _id: 'pet-1', name: 'Milo' },
      profileCompleteness: { complete: true, missingFields: [] },
      recommendations: [{
        service: { _id: 'old', name: 'Stale Service', price: 100, store: { name: 'Old Store' }, images: [] },
        score: 100,
        matchLevel: 'High',
        explanations: ['Old response']
      }]
    } });
    await Promise.resolve();
  });

  await waitFor(() => expect(screen.queryByText('Stale Service')).not.toBeInTheDocument());
  expect(screen.getByText("Complete Luna's profile for more accurate recommendations.")).toBeInTheDocument();
});
