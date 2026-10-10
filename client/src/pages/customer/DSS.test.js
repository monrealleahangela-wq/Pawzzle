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
    getServiceAdvisorRequirements: jest.fn(),
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

const insights = {
  myPets: [
    { _id: 'pet-1', name: 'Milo', type: 'dog', breed: 'Mixed', size: 'Small', coat: { length: 'short', type: 'straight' } },
    { _id: 'pet-2', name: 'Luna', type: 'cat', breed: 'Domestic Shorthair', size: 'Medium', coat: { length: 'long', type: 'straight' } }
  ]
};

const matchingResponse = (id = 'service-1', name = 'Dog Bath') => ({
  status: 'matches',
  recommendations: [{
    service: {
      _id: id,
      name,
      description: 'A real seller-created grooming service.',
      category: 'grooming',
      images: [],
      store: { _id: 'store-1', name: 'Happy Paws' }
    },
    pricing: { status: 'fixed', minPrice: 450, maxPrice: 450 },
    budgetCompatibility: 'within_budget',
    explanations: ['Matches your selected Grooming / Bath service.', 'Supports dogs.']
  }],
  budgetAlternatives: [],
  pricingUnknown: [],
  missingFields: [],
  disclaimer: 'Service discovery only.'
});

beforeEach(() => {
  jest.clearAllMocks();
  dssService.getCustomerInsights.mockResolvedValue({ data: insights });
  dssService.getServiceAdvisorRequirements.mockResolvedValue({ data: { fields: [] } });
  dssService.getServiceRecommendations.mockResolvedValue({ data: matchingResponse() });
});

const renderAdvisor = async (customerInsights = insights) => {
  dssService.getCustomerInsights.mockResolvedValueOnce({ data: customerInsights });
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><CustomerDSS /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('tab', { name: /Service Advisor/ }));
  return screen.findByRole('heading', { name: "What's your budget for this service?" });
};

const chooseAndContinue = async name => {
  const accessibleName = typeof name === 'string' && name.startsWith('Under ') ? /^Under / : name;
  fireEvent.click(await screen.findByRole('button', { name: accessibleName }));
  fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
};

test('Service Advisor is a five-step manual questionnaire and submits canonical real-service answers only after review', async () => {
  await renderAdvisor({ myPets: [] });
  const continueButton = screen.getByRole('button', { name: /Continue/ });
  expect(continueButton).toBeDisabled();

  await chooseAndContinue('Under ₱500');
  expect(screen.getByRole('heading', { name: 'What type of pet do you have?' })).toBeInTheDocument();
  expect(screen.queryByLabelText(/saved pet profile/i)).not.toBeInTheDocument();

  await chooseAndContinue('Dog');
  expect(screen.getByRole('heading', { name: 'What service are you looking for?' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Grooming / Bath' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Health & Wellness' })).toBeInTheDocument();

  await chooseAndContinue('Grooming / Bath');
  await waitFor(() => expect(dssService.getServiceAdvisorRequirements).toHaveBeenCalledWith({ petType: 'dog', serviceNeed: 'grooming' }));
  expect(screen.getByRole('heading', { name: 'What matters most to you?' })).toBeInTheDocument();

  await chooseAndContinue(/Service compatibility/);
  expect(screen.getByRole('heading', { name: 'Review and find services' })).toBeInTheDocument();
  expect(screen.getByText('Under ₱500')).toBeInTheDocument();
  expect(screen.getByText('Grooming / Bath')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Find Matching Services/ }));
  await waitFor(() => expect(dssService.getServiceRecommendations).toHaveBeenCalledWith({
    budget: 'under_500',
    petType: 'dog',
    serviceNeed: 'grooming',
    priority: 'compatibility',
    details: {}
  }));
  expect(await screen.findByRole('heading', { name: 'Dog Bath' })).toBeInTheDocument();
  expect(screen.getByText('Happy Paws')).toBeInTheDocument();
  expect(screen.getByText('₱450.00')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View details' })).toHaveAttribute('href', '/services/service-1');
  expect(screen.getByRole('link', { name: /Book service/ })).toHaveAttribute('href', '/bookings?service=service-1');
});

test('optional owned Pet Profile prefills factual details and conditional restrictions are explicitly answered', async () => {
  dssService.getServiceAdvisorRequirements.mockResolvedValue({ data: {
    fields: [
      { field: 'size', label: 'Pet size', options: ['small', 'medium', 'large', 'extra_large'] },
      { field: 'coatLength', label: 'Coat length', options: ['short', 'medium', 'long'] }
    ]
  } });
  await renderAdvisor();
  await chooseAndContinue('₱500–₱1,000');

  fireEvent.change(screen.getByLabelText(/Use a saved pet profile/), { target: { value: 'pet-1' } });
  expect(screen.getByRole('button', { name: 'Dog' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
  await chooseAndContinue('Grooming / Bath');

  await screen.findByText('A little more information is needed');
  expect(screen.getByLabelText('Pet size')).toHaveValue('small');
  expect(screen.getByLabelText('Coat length')).toHaveValue('short');
  fireEvent.click(screen.getByRole('button', { name: /Lowest price/ }));
  fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
  fireEvent.click(screen.getByRole('button', { name: /Find Matching Services/ }));

  await waitFor(() => expect(dssService.getServiceRecommendations).toHaveBeenCalledWith(expect.objectContaining({
    petProfileId: 'pet-1',
    petType: 'dog',
    priority: 'lowest_price',
    details: expect.objectContaining({ size: 'small', coatLength: 'short' })
  })));
});

test('answers survive Back navigation and changing an answer prevents a stale recommendation response from winning', async () => {
  const first = deferred();
  dssService.getServiceRecommendations
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValueOnce({ data: matchingResponse('fresh', 'Fresh Match') });
  await renderAdvisor({ myPets: [] });
  await chooseAndContinue('Under ₱500');
  await chooseAndContinue('Dog');
  await chooseAndContinue('Grooming / Bath');
  await chooseAndContinue(/Service compatibility/);

  fireEvent.click(screen.getByRole('button', { name: /Find Matching Services/ }));
  fireEvent.click(screen.getByRole('button', { name: /Back/ }));
  expect(screen.getByRole('button', { name: /Service compatibility/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: /Lowest price/ }));
  fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
  fireEvent.click(screen.getByRole('button', { name: /Find Matching Services/ }));

  expect(await screen.findByRole('heading', { name: 'Fresh Match' })).toBeInTheDocument();
  await act(async () => {
    first.resolve({ data: matchingResponse('stale', 'Stale Match') });
    await Promise.resolve();
  });
  await waitFor(() => expect(screen.queryByText('Stale Match')).not.toBeInTheDocument());
  expect(screen.getByText('Fresh Match')).toBeInTheDocument();
});

test('distinct restriction, budget, seller opt-in, Store visibility, and request-failure states are rendered', async () => {
  await renderAdvisor({ myPets: [] });
  await chooseAndContinue('Under ₱500');
  await chooseAndContinue('Dog');
  await chooseAndContinue('Grooming / Bath');
  await chooseAndContinue(/No preference/);

  dssService.getServiceRecommendations.mockResolvedValueOnce({ data: {
    status: 'missing_information', recommendations: [], budgetAlternatives: [], pricingUnknown: [],
    missingFields: [{ field: 'coatType', label: 'coat type' }]
  } });
  fireEvent.click(screen.getByRole('button', { name: /Find Matching Services/ }));
  expect(await screen.findByRole('heading', { name: 'More pet information is required' })).toBeInTheDocument();
  expect(screen.getByText(/needs coat type/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Adjust answers/ }));
  await chooseAndContinue('Under ₱500');
  await chooseAndContinue('Dog');
  await chooseAndContinue('Grooming / Bath');
  await chooseAndContinue(/No preference/);
  dssService.getServiceRecommendations.mockResolvedValueOnce({ data: {
    status: 'budget_mismatch', recommendations: [], pricingUnknown: [], missingFields: [],
    budgetAlternatives: [{ ...matchingResponse().recommendations[0], budgetCompatibility: 'over_budget' }]
  } });
  fireEvent.click(screen.getByRole('button', { name: /Find Matching Services/ }));
  expect(await screen.findByRole('heading', { name: 'No compatible service fits this budget' })).toBeInTheDocument();
  expect(screen.getByText('Compatible alternatives outside your budget')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Adjust answers/ }));
  await chooseAndContinue('Under ₱500');
  await chooseAndContinue('Dog');
  await chooseAndContinue('Grooming / Bath');
  await chooseAndContinue(/No preference/);
  dssService.getServiceRecommendations.mockResolvedValueOnce({ data: {
    status: 'seller_opt_in_unavailable', recommendations: [], budgetAlternatives: [], pricingUnknown: [], missingFields: []
  } });
  fireEvent.click(screen.getByRole('button', { name: /Find Matching Services/ }));
  expect(await screen.findByRole('heading', { name: 'No seller-enabled recommendations in this category' })).toBeInTheDocument();
  expect(screen.getByText(/providers have not enabled them/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Adjust answers/ }));
  await chooseAndContinue('Under â‚±500');
  await chooseAndContinue('Dog');
  await chooseAndContinue('Grooming / Bath');
  await chooseAndContinue(/No preference/);
  dssService.getServiceRecommendations.mockResolvedValueOnce({ data: {
    status: 'store_visibility_unavailable', recommendations: [], budgetAlternatives: [], pricingUnknown: [], missingFields: []
  } });
  fireEvent.click(screen.getByRole('button', { name: /Find Matching Services/ }));
  expect(await screen.findByRole('heading', { name: 'No customer-visible provider is available' })).toBeInTheDocument();
  expect(screen.getByText(/verified, active provider visible to customers/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Adjust answers/ }));
  await chooseAndContinue('Under ₱500');
  await chooseAndContinue('Dog');
  await chooseAndContinue('Grooming / Bath');
  await chooseAndContinue(/No preference/);
  dssService.getServiceRecommendations.mockRejectedValueOnce({ response: { data: { message: 'Temporary failure.' } } });
  fireEvent.click(screen.getByRole('button', { name: /Find Matching Services/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Temporary failure.');
  expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
}, 15000);

test('Pet Matching remains available and uses its independent recommendation endpoint', async () => {
  dssService.getPetRecommendations.mockResolvedValue({ data: { recommendations: [] } });
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><CustomerDSS /></MemoryRouter>);
  expect(await screen.findByRole('tab', { name: /Pet Matching/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Pet Compatibility Assessment')).toBeInTheDocument();
  expect(dssService.getServiceRecommendations).not.toHaveBeenCalled();
});
