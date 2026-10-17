import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PetPurchaseInquiryList from './PetPurchaseInquiryList';
import { adoptionService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  adoptionService: { getMyRequests: jest.fn() },
  getImageUrl: value => value
}));

const renderList = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PetPurchaseInquiryList /></MemoryRouter>);

beforeEach(() => jest.clearAllMocks());

test('shows authorized purchase inquiries outside the message module, newest first', async () => {
  adoptionService.getMyRequests.mockResolvedValue({ data: { requests: [
    { _id: 'old', conversation: 'conversation-old', status: 'under_review', createdAt: '2026-10-15T01:00:00Z', updatedAt: '2026-10-15T02:00:00Z', pet: { _id: 'pet-old', name: 'Milo', breed: 'Poodle', images: ['/milo.jpg'] }, paymentDetails: { paymentStatus: 'unpaid' } },
    { _id: 'new', conversation: { _id: 'conversation-new' }, status: 'approved', createdAt: '2026-10-16T01:00:00Z', updatedAt: '2026-10-17T02:00:00Z', pet: { _id: 'pet-new', name: 'Luna', breed: 'Persian', images: ['/luna.jpg'] }, paymentDetails: { paymentStatus: 'payment_pending' } }
  ] } });

  renderList();
  expect(screen.getByRole('status')).toHaveTextContent('Loading purchase inquiries');
  const region = await screen.findByRole('region', { name: 'Purchase inquiries' });
  const articles = await within(region).findAllByRole('article');
  expect(articles[0]).toHaveTextContent('Luna');
  expect(articles[1]).toHaveTextContent('Milo');
  expect(within(articles[0]).getByRole('link', { name: 'Open Messages' })).toHaveAttribute('href', '/messages/conversation-new');
  expect(within(articles[0]).getByRole('link', { name: 'View Pet' })).toHaveAttribute('href', '/pets/pet-new');
  expect(within(articles[0]).getByText('Payment Requested')).toBeInTheDocument();
});

test('shows an empty state when the customer has no purchase inquiries', async () => {
  adoptionService.getMyRequests.mockResolvedValue({ data: { requests: [] } });
  renderList();
  expect(await screen.findByText('No purchase inquiries yet.')).toBeInTheDocument();
});

test('shows a retryable error without exposing stale inquiry data', async () => {
  adoptionService.getMyRequests
    .mockRejectedValueOnce({ response: { data: { message: 'Unable to load your inquiries.' } } })
    .mockResolvedValueOnce({ data: { requests: [] } });
  renderList();
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Unable to load your inquiries.');
  fireEvent.click(within(alert).getByRole('button', { name: /Retry/i }));
  expect(await screen.findByText('No purchase inquiries yet.')).toBeInTheDocument();
  expect(adoptionService.getMyRequests).toHaveBeenCalledTimes(2);
});
