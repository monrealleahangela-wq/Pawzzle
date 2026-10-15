import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SupplierPartnershipPanel from './SupplierPartnershipPanel';
import { supplierService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({ supplierService: {
  getPartnerships: jest.fn(), getCatalog: jest.fn(), requestPartnership: jest.fn(),
  actOnPartnership: jest.fn()
} }));

const terms = {
  coveredSupplierProducts: ['offer-1'], pricingMethod: 'catalog_at_order',
  minimumOrderQuantity: 1, estimatedDeliveryDays: 3, paymentDeadlineDays: 7,
  effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveUntil: '2027-01-01T00:00:00.000Z',
  priceUpdateConditions: 'Review catalog price.', inventoryResponsibilities: 'Supplier stock.',
  deliveryArrangements: 'Dispatch to Store.', paymentTerms: 'External payment.',
  returnReplacementDamagePolicy: 'Review damage.', cancellationDisputeProcedure: 'Discuss disputes.',
  terminationConditions: 'Terminate with reason.', otherTerms: 'No additional terms.'
};
const agreement = { _id: 'agreement-1', store: { name: 'Store A' }, supplier: { _id: 'supplier-1', businessName: 'Supplier A' },
  status: 'pending_seller', effectiveStatus: 'pending_seller', currentVersion: 1,
  versions: [{ number: 1, hash: 'hash-1', terms, createdAt: '2026-10-01T00:00:00Z', supplierAcceptance: { acceptedAt: '2026-10-02T00:00:00Z' } }],
  history: [{ at: '2026-10-01T00:00:00Z', action: 'requested', version: 1 }] };

beforeEach(() => {
  jest.clearAllMocks();
  supplierService.getPartnerships.mockResolvedValue({ data: [agreement] });
  supplierService.getCatalog.mockResolvedValue({ data: { products: [{ _id: 'offer-1', name: 'Offer A', sku: 'A' }] } });
  supplierService.requestPartnership.mockResolvedValue({ data: agreement });
  supplierService.actOnPartnership.mockResolvedValue({ data: agreement });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => window.confirm.mockRestore());

test('seller sees the current version, history, and explicitly accepts its hash', async () => {
  render(<SupplierPartnershipPanel side="seller" suppliers={[]} />);
  fireEvent.click(await screen.findByRole('button', { name: /Supplier A.*pending seller confirmation.*v1/i }));
  expect(screen.getByText(/Integrity hash: hash-1/)).toBeInTheDocument();
  expect(screen.getByText(/requested · v1/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Accept this version' }));
  await waitFor(() => expect(supplierService.actOnPartnership).toHaveBeenCalledWith('seller', 'agreement-1', {
    action: 'accept', version: 1, hash: 'hash-1', note: ''
  }));
  expect(await screen.findByText('Partnership updated.')).toBeInTheDocument();
});

test('supplier sees Store-specific request and cannot access Seller proposal controls', async () => {
  render(<SupplierPartnershipPanel side="supplier" />);
  expect(await screen.findByRole('button', { name: /Store A.*pending seller confirmation.*v1/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Request partnership' })).not.toBeInTheDocument();
});

test('request form loads real offers and submits selected coverage', async () => {
  supplierService.getPartnerships.mockResolvedValue({ data: [] });
  render(<SupplierPartnershipPanel side="seller" suppliers={[{ _id: 'supplier-1', businessName: 'Supplier A', selectable: true }]} />);
  await screen.findByText('No partnership agreements yet.');
  fireEvent.click(screen.getByRole('button', { name: 'Request partnership' }));
  fireEvent.change(screen.getByRole('combobox', { name: /Supplier/i }), { target: { value: 'supplier-1' } });
  fireEvent.click(await screen.findByRole('checkbox', { name: /Offer A/i }));
  expect(screen.getByRole('button', { name: 'Submit for review' })).not.toBeDisabled();
  expect(supplierService.getCatalog).toHaveBeenCalledWith('supplier-1', { limit: 100 });
});

test('loading failure is visible and retryable', async () => {
  supplierService.getPartnerships.mockRejectedValueOnce(new Error('network'));
  render(<SupplierPartnershipPanel side="supplier" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load partnerships.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading partnerships' }));
  expect(await screen.findByRole('button', { name: /Store A.*pending seller confirmation.*v1/i })).toBeInTheDocument();
});
