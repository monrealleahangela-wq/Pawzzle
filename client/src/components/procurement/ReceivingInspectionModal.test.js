import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReceivingInspectionModal from './ReceivingInspectionModal';
import { purchaseOrderService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  purchaseOrderService: {
    getReceivingProductLinks: jest.fn(),
    linkReceivingStoreProduct: jest.fn(),
    createReceivingStoreProduct: jest.fn()
  }
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() }
}));

const order = {
  _id: 'po-1',
  orderNumber: 'PO-1001',
  supplier: { businessName: 'Supplier One' },
  items: [{ _id: 'line-1', itemType: 'pet_supply', productName: 'petsup', quantity: 3 }]
};

const Harness = ({ onSubmit = jest.fn(), onProductLinked = jest.fn() }) => {
  const [form, setForm] = useState({
    items: { 'line-1': { purchaseOrderItem: 'line-1', receivedQuantity: 3, damagedQuantity: 0, incorrectQuantity: 0, notes: '' } },
    notes: '',
    photos: []
  });
  return <ReceivingInspectionModal order={order} form={form} setForm={setForm} submitting={false} resolution={null} onClose={jest.fn()} onSubmit={onSubmit} onProductLinked={onProductLinked} />;
};

beforeEach(() => {
  jest.clearAllMocks();
  purchaseOrderService.getReceivingProductLinks.mockResolvedValue({
    data: {
      items: [{
        purchaseOrderItem: 'line-1',
        linkedProduct: null,
        eligibleProducts: [],
        suggestions: {
          name: 'petsup',
          category: 'Pet Accessories',
          description: 'Supplier-provided description',
          supplierSku: 'PETSUP-SUPPLIER',
          supplierRetailPrice: 99,
          unit: 'pack',
          supplierImageCount: 1
        }
      }]
    }
  });
});

test('first-time product creation preserves the inspection draft and unlocks submission only after linking', async () => {
  const onProductLinked = jest.fn();
  purchaseOrderService.createReceivingStoreProduct.mockResolvedValue({
    data: {
      created: true,
      message: 'Draft Store product created and linked for receiving.',
      product: { _id: 'product-1', name: 'petsup', sku: 'STORE-PETSUP', stockQuantity: 0, visibility: 'draft' }
    }
  });

  render(<Harness onProductLinked={onProductLinked} />);

  expect(await screen.findByText(/No compatible active Store product exists yet/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Submit Inspection Report' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Overall notes'), { target: { value: 'Boxes intact; count verified.' } });
  fireEvent.change(screen.getByLabelText('Notes for petsup'), { target: { value: 'Received at front desk.' } });

  fireEvent.click(screen.getByRole('button', { name: /Create New Store Product/i }));
  expect(await screen.findByRole('dialog', { name: 'Create New Store Product' })).toBeInTheDocument();
  expect(screen.getByLabelText('Product name')).toHaveValue('petsup');
  expect(screen.getByLabelText('Category')).toHaveValue('Pet Accessories');
  expect(screen.getByLabelText('Description')).toHaveValue('Supplier-provided description');
  expect(screen.getByLabelText(/Store SKU/i)).toHaveValue('');
  expect(screen.getByLabelText('Selling price')).toHaveValue(null);

  fireEvent.change(screen.getByLabelText(/Store SKU/i), { target: { value: 'STORE-PETSUP' } });
  fireEvent.change(screen.getByLabelText('Selling price'), { target: { value: '120' } });
  fireEvent.change(screen.getByLabelText('Short description'), { target: { value: 'New supply item' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Draft & Link' }));

  await waitFor(() => expect(purchaseOrderService.createReceivingStoreProduct).toHaveBeenCalledWith('po-1', 'line-1', expect.objectContaining({
    sku: 'STORE-PETSUP',
    price: '120',
    unit: 'pack'
  })));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create New Store Product' })).not.toBeInTheDocument());
  expect(screen.getByLabelText('Overall notes')).toHaveValue('Boxes intact; count verified.');
  expect(screen.getByLabelText('Notes for petsup')).toHaveValue('Received at front desk.');
  expect(screen.getByRole('button', { name: 'Submit Inspection Report' })).toBeEnabled();
  expect(onProductLinked).toHaveBeenCalledWith('line-1', expect.objectContaining({ visibility: 'draft' }));
});

test('existing product selection links through the receiving endpoint without changing quantities', async () => {
  purchaseOrderService.getReceivingProductLinks.mockResolvedValue({
    data: { items: [{ purchaseOrderItem: 'line-1', linkedProduct: null, eligibleProducts: [{ _id: 'product-2', name: 'Existing supply', sku: 'EXIST-1', stockQuantity: 4 }] }] }
  });
  purchaseOrderService.linkReceivingStoreProduct.mockResolvedValue({ data: { product: { _id: 'product-2', name: 'Existing supply', sku: 'EXIST-1', stockQuantity: 4 } } });

  render(<Harness />);
  const selector = await screen.findByLabelText('Store product for petsup');
  await waitFor(() => expect(selector).toBeEnabled());
  fireEvent.change(selector, { target: { value: 'product-2' } });

  await waitFor(() => expect(purchaseOrderService.linkReceivingStoreProduct).toHaveBeenCalledWith('po-1', 'line-1', 'product-2'));
  expect(screen.getByLabelText('Received')).toHaveValue(3);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit Inspection Report' })).toBeEnabled());
});

test('a service-supply receiving line retains its destination without a Store product link', async () => {
  purchaseOrderService.getReceivingProductLinks.mockResolvedValue({ data: { items: [{
    purchaseOrderItem: 'line-1', serviceSupply: { _id: 'supply-1', name: 'Shampoo' },
    linkSource: 'service_supply', eligibleProducts: []
  }] } });
  const onSubmit = jest.fn();
  render(<ReceivingInspectionModal
    order={{ _id: 'po-1', orderNumber: 'PO-1', supplier: { businessName: 'Supplier A' },
      items: [{ _id: 'line-1', productName: 'Shampoo', quantity: 3,
        itemType: 'pet_supply', serviceSupply: { _id: 'supply-1', name: 'Shampoo' } }] }}
    form={{ items: { 'line-1': { receivedQuantity: 2, damagedQuantity: 0, incorrectQuantity: 0 } },
      notes: '', photos: [] }}
    setForm={jest.fn()} submitting={false} onClose={jest.fn()} onSubmit={onSubmit}
  />);
  expect(await screen.findByText(/Accepted units will be added to service supply/)).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: /Store product for/ })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit Inspection Report' })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'Submit Inspection Report' }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});
