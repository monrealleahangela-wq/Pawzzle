import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StoreComplianceReviewPanel from './StoreComplianceReviewPanel';
import { storeComplianceService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  storeComplianceService: {
    getRequests: jest.fn(),
    getRequest: jest.fn(),
    getRequestDocument: jest.fn(),
    reviewRequest: jest.fn()
  }
}));

jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn() }
}));

beforeEach(() => {
  jest.clearAllMocks();
  storeComplianceService.getRequests.mockResolvedValue({
    data: {
      requests: [{
        _id: 'request-1',
        requestType: 'business_update',
        status: 'pending_review',
        submittedAt: '2026-11-19T00:00:00.000Z',
        reason: 'Update registration details',
        store: { name: 'Pawzzle' }
      }]
    }
  });
  storeComplianceService.getRequest.mockResolvedValue({
    data: {
      request: {
        _id: 'request-1',
        requestType: 'business_update',
        reason: 'Update registration details',
        store: { name: 'Pawzzle' },
        owner: { firstName: 'Eugene', lastName: 'Pabello', email: 'owner@example.com' },
        currentSnapshot: { business: { tradeName: 'Pawzzle' } },
        proposedProfile: { business: { tradeName: 'Pawzzle Store' } },
        proposedDocuments: []
      }
    }
  });
});

test('compliance review close control stays above the application shell and closes the dialog', async () => {
  render(<StoreComplianceReviewPanel />);

  fireEvent.click(await screen.findByRole('button', { name: /pawzzle/i }));

  const dialog = await screen.findByRole('dialog');
  const closeButton = screen.getByRole('button', { name: 'Close compliance review' });
  expect(dialog).toHaveClass('z-[1000]');
  expect(closeButton).toHaveClass('bg-slate-900', 'text-white');

  fireEvent.click(closeButton);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
