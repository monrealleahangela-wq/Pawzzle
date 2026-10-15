import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SupplierMessages from './SupplierMessages';
import { supplierChatService } from '../../services/supplierChatService';
import socket from '../../utils/socket';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'owner', role: 'admin' } }) }));
jest.mock('../../services/supplierChatService', () => ({ supplierChatService: {
  list: jest.fn(), open: jest.fn(), messages: jest.fn(), send: jest.fn(), read: jest.fn()
} }));
jest.mock('../../utils/socket', () => ({ __esModule: true, default: {
  connected: true, on: jest.fn(), off: jest.fn(), emit: jest.fn((_, __, ack) => ack?.({ allowed: true })), connect: jest.fn()
} }));

const row = { _id: 'conversation1', supplier: { businessName: 'Synthetic Supplier' },
  store: { name: 'Synthetic Store' }, updatedAt: '2026-10-15T00:00:00Z', unreadCount: 1 };
const renderPage = route => render(<MemoryRouter initialEntries={[route]}><SupplierMessages /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
  supplierChatService.list.mockResolvedValue({ data: { conversations: [row] } });
  supplierChatService.open.mockResolvedValue({ data: { conversation: row } });
  supplierChatService.messages.mockResolvedValue({ data: { messages: [], nextCursor: null } });
  supplierChatService.read.mockResolvedValue({ data: { markedRead: 1 } });
  supplierChatService.send.mockResolvedValue({ data: { created: true } });
});

test('opens authorized supplier context and sends a persistent message with retry ID', async () => {
  renderPage('/admin/supplier-messages?supplier=supplier1');
  await waitFor(() => expect(supplierChatService.open).toHaveBeenCalledWith({
    supplierId: 'supplier1', purchaseOrderId: undefined, supplierProductId: undefined
  }));
  await waitFor(() => expect(screen.getAllByText('Synthetic Supplier').length).toBeGreaterThan(0));
  fireEvent.change(screen.getByLabelText('Message Supplier or Store'), { target: { value: 'Please confirm the lead time.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(supplierChatService.send).toHaveBeenCalledWith(
    'conversation1', 'Please confirm the lead time.', expect.stringMatching(/^[\w-]{12,80}$/)));
  expect(screen.getByText(/Messages do not approve agreements/)).toBeInTheDocument();
  expect(socket.emit).toHaveBeenCalledWith('joinSupplierConversation', 'conversation1', expect.any(Function));
});

test('shows empty and error states and unregisters realtime listeners', async () => {
  const view = renderPage('/admin/supplier-messages');
  await waitFor(() => expect(socket.on).toHaveBeenCalledWith('supplierMessage', expect.any(Function)));
  const notificationHandler = socket.on.mock.calls.find(([event]) => event === 'newNotification')[1];
  supplierChatService.list.mockResolvedValue({ data: { conversations: [{ ...row, unreadCount: 2 }] } });
  await act(async () => notificationHandler({ relatedModel: 'Conversation',
    targetUrl: '/admin/supplier-messages?conversation=conversation1' }));
  expect(screen.getByLabelText('2 unread messages')).toBeInTheDocument();
  view.unmount();
  expect(socket.off).toHaveBeenCalledWith('supplierMessage', expect.any(Function));
  expect(socket.off).toHaveBeenCalledWith('newNotification', notificationHandler);
  supplierChatService.list.mockResolvedValue({ data: { conversations: [] } });
  const { unmount: unmountEmpty } = renderPage('/admin/supplier-messages');
  expect(await screen.findByText(/No Supplier conversations yet/)).toBeInTheDocument();
  unmountEmpty();
  supplierChatService.list.mockRejectedValueOnce(new Error('Offline'));
  renderPage('/admin/supplier-messages');
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Supplier messages are unavailable'));
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});
