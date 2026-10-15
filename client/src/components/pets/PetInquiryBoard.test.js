import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PetInquiryBoard from './PetInquiryBoard';
import petInquiryService from '../../services/petInquiryService';
import { notificationDestination } from '../../utils/notificationNavigation';

jest.mock('../../services/petInquiryService', () => ({ list: jest.fn(), get: jest.fn(), create: jest.fn(), act: jest.fn() }));
jest.mock('../../services/apiService', () => ({ getImageUrl: value => value }));
let mockViewerId = 'customer-1';
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: mockViewerId, role: 'customer' } }) }));
const base = { _id: 'i1', pet: 'p1', petSnapshot: { name: 'Milo' }, subject: 'Diet', status: 'submitted', events: [{ _id: 'e1', status: 'submitted', body: 'What food?', createdAt: '2026-10-15T00:00:00Z' }] };
const renderBoard = props => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PetInquiryBoard {...props} /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
  mockViewerId = 'customer-1';
  petInquiryService.list.mockResolvedValue({ data: { inquiries: [base], pagination: { totalPages: 1 } } });
});

test('customer sees real history and submits a separate pet question', async () => {
  petInquiryService.create.mockResolvedValue({ data: { inquiry: base } });
  renderBoard({ mode: 'customer', petId: 'p1', petName: 'Milo', petAvailable: true });
  expect(screen.getByRole('status')).toHaveTextContent('Loading inquiries');
  await screen.findByText('Diet');
  fireEvent.click(screen.getByRole('button', { name: /Diet Milo · Submitted/ }));
  expect(screen.getByText('What food?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ask About This Pet' }));
  fireEvent.change(screen.getByLabelText('Inquiry subject'), { target: { value: 'Care question' } });
  fireEvent.change(screen.getByLabelText('Inquiry question'), { target: { value: 'What food does Milo eat?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Inquiry' }));
  await waitFor(() => expect(petInquiryService.create).toHaveBeenCalledWith(expect.objectContaining({ petId: 'p1', subject: 'Care question', question: 'What food does Milo eat?', requestKey: expect.any(String) })));
  expect(await screen.findByText('Your question was sent to the Store.')).toBeInTheDocument();
});

test('seller can reply, request information, and resolve but not cancel', async () => {
  petInquiryService.act.mockResolvedValue({ data: { inquiry: { ...base, status: 'seller_responded' } } });
  renderBoard({ mode: 'seller' });
  await screen.findByText('Diet');
  expect(petInquiryService.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'needs_response' }));
  expect(screen.getByText('Needs response')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Diet Milo · Submitted/ }));
  expect(screen.getByRole('button', { name: 'Reply to Customer' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Request More Information' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mark Resolved' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancel Inquiry' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Inquiry response'), { target: { value: 'Milo eats approved food.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reply to Customer' }));
  await waitFor(() => expect(petInquiryService.act).toHaveBeenCalledWith('i1', expect.objectContaining({ action: 'seller_reply', body: 'Milo eats approved food.' })));
  expect(await screen.findByText('Inquiry updated.')).toBeInTheDocument();
});

test('customer follow-up and cancellation controls are separate from seller actions', async () => {
  petInquiryService.list.mockResolvedValue({ data: { inquiries: [{ ...base, status: 'additional_information_required' }], pagination: { totalPages: 1 } } });
  renderBoard({ mode: 'customer' });
  await screen.findByText('Diet');
  fireEvent.click(screen.getByRole('button', { name: 'Diet Milo · Additional Information Required' }));
  expect(screen.getByRole('button', { name: 'Send Follow-up' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel Inquiry' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Mark Resolved' })).not.toBeInTheDocument();
});

test('loading, empty, error and retry states use API data', async () => {
  petInquiryService.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { inquiries: [], pagination: { totalPages: 1 } } });
  renderBoard({ mode: 'customer' });
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('No inquiries yet.')).toBeInTheDocument();
});

test('unavailable pet still shows history without offering a new inquiry', async () => {
  renderBoard({ mode: 'customer', petId: 'p1', petAvailable: false });
  await screen.findByText('Diet');
  expect(screen.queryByRole('button', { name: 'Ask About This Pet' })).not.toBeInTheDocument();
});

test('inquiry notifications link only to the matching customer or seller portal', () => {
  const customerNotice = { relatedModel: 'PetInquiry', targetUrl: '/pet-inquiries?id=i1' };
  const sellerNotice = { relatedModel: 'PetInquiry', targetUrl: '/admin/pet-inquiries?id=i1' };
  expect(notificationDestination(customerNotice, { role: 'customer' })).toBe('/pet-inquiries?id=i1');
  expect(notificationDestination(customerNotice, { role: 'admin' })).toBeNull();
  expect(notificationDestination(sellerNotice, { role: 'admin' })).toBe('/admin/pet-inquiries?id=i1');
  expect(notificationDestination(sellerNotice, { role: 'customer' })).toBeNull();
});

test('switching accounts clears the previous customer inquiry from the panel', async () => {
  petInquiryService.list.mockResolvedValueOnce({ data: { inquiries: [base], pagination: { totalPages: 1 } } })
    .mockResolvedValueOnce({ data: { inquiries: [{ ...base, _id: 'i2', subject: 'Other account' }], pagination: { totalPages: 1 } } });
  const view = renderBoard({ mode: 'customer' });
  await screen.findByText('Diet');
  fireEvent.click(screen.getByRole('button', { name: /Diet Milo · Submitted/ }));
  mockViewerId = 'customer-2';
  view.rerender(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PetInquiryBoard mode="customer" /></MemoryRouter>);
  expect(screen.queryByText('Diet')).not.toBeInTheDocument();
  expect(screen.queryByText('What food?')).not.toBeInTheDocument();
  expect(await screen.findByText('Other account')).toBeInTheDocument();
  expect(screen.queryByText('Diet')).not.toBeInTheDocument();
  expect(screen.queryByText('What food?')).not.toBeInTheDocument();
});
