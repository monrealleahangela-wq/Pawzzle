import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReturnIssueModal from './ReturnIssueModal';
import { orderReturnService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  orderReturnService: { request: jest.fn() }
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

describe('ReturnIssueModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    orderReturnService.request.mockResolvedValue({ data: { return: { _id: 'case-1', caseId: 'RET-ONE' } } });
    global.URL.createObjectURL = jest.fn(() => 'blob:preview');
  });

  it('submits an item-specific complaint with resolution and multiple evidence files', async () => {
    const onClose = jest.fn();
    render(<ReturnIssueModal orderId="order-1" item={{ _id: 'item-1', name: 'Dog Food', quantity: 2 }} onClose={onClose}/>);
    fireEvent.change(screen.getByLabelText('Issue type'), { target: { value: 'wrong_item' } });
    fireEvent.change(screen.getByLabelText('Requested resolution'), { target: { value: 'replacement' } });
    fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'The delivered flavor is different.' } });
    const files = [new File(['one'], 'one.jpg', { type: 'image/jpeg' }), new File(['two'], 'two.mp4', { type: 'video/mp4' })];
    fireEvent.change(screen.getByLabelText(/Attach photos or videos/i), { target: { files } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Issue' }));
    await waitFor(() => expect(orderReturnService.request).toHaveBeenCalledTimes(1));
    const [orderId, body] = orderReturnService.request.mock.calls[0];
    expect(orderId).toBe('order-1');
    expect(body.get('itemId')).toBe('item-1');
    expect(body.get('issueType')).toBe('wrong_item');
    expect(body.get('requestedResolution')).toBe('replacement');
    expect(body.getAll('evidence')).toHaveLength(2);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('warns that reporting does not create an immediate refund', () => {
    render(<ReturnIssueModal orderId="order-1" item={{ _id: 'item-1', name: 'Dog Food', quantity: 1 }} onClose={()=>{}}/>);
    expect(screen.getByText(/does not create an immediate refund/i)).toBeTruthy();
  });
});
