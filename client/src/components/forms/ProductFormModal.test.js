import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ProductFormModal from './ProductFormModal';

jest.mock('../../services/apiService', () => ({ getImageUrl: value => value }));

const initial = {
  name: 'Synthetic food', category: 'Pet Food', brand: '', sku: '', barcode: '',
  description: 'Synthetic description', price: '100', stockQuantity: '2', lowStockThreshold: 1,
  unit: 'piece', weight: '750', weightUnit: 'g', weightIncludesPackaging: true,
  packagingWeight: '', packagingWeightUnit: 'g', images: ['/synthetic.jpg'], visibility: 'published',
  stockStatus: 'in_stock'
};

const Harness = ({ editingProduct, startingForm = initial, variantCapabilities = { enabled: false } }) => {
  const [form, setForm] = React.useState(startingForm);
  return <ProductFormModal editingProduct={editingProduct} form={form} setForm={setForm} onClose={jest.fn()} onSubmit={event => event.preventDefault()} onImageUpload={jest.fn()} loading={false} onAdvanced={jest.fn()} variantCapabilities={variantCapabilities}/>;
};

test('seller product form captures authoritative unit and optional packaging weights', () => {
  render(<Harness/>);
  expect(screen.getByLabelText(/Unit Product \/ Package Weight/i)).toHaveValue(750);
  const includes = screen.getByRole('checkbox', { name: /already includes ordinary product packaging/i });
  expect(includes).toBeChecked();
  expect(screen.queryByLabelText(/Additional Packaging Weight/i)).not.toBeInTheDocument();
  fireEvent.click(includes);
  const packaging = screen.getByLabelText(/Additional Packaging Weight/i);
  fireEvent.change(packaging, { target: { value: '35.5' } });
  expect(packaging).toHaveValue(35.5);
});

test('variant product UI is gated and captures only explicit combinations', () => {
  render(<Harness variantCapabilities={{ enabled: true, customerBrowsingEnabled: true }} startingForm={{ ...initial, productMode: 'simple', normalizedVariants: [] }}/>);
  fireEvent.click(screen.getByRole('button', { name: /Product With Variants/i }));
  expect(screen.getByText(/Add only combinations you actually sell/i)).toBeInTheDocument();
  expect(screen.getByText(/Customer price is calculated from the variants/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/^Price/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Add explicit combination/i }));
  fireEvent.change(screen.getByPlaceholderText(/Flavor, Size, Color/i), { target: { value: 'Flavor' } });
  fireEvent.change(screen.getByPlaceholderText(/Chicken, 1 kg, Blue/i), { target: { value: 'Chicken' } });
  fireEvent.click(screen.getByRole('button', { name: /Add another option/i }));
  fireEvent.change(screen.getByPlaceholderText(/Size, Weight, Packaging/i), { target: { value: 'Size' } });
  fireEvent.change(screen.getByPlaceholderText(/1 kg, 500 mL, Box/i), { target: { value: '1 kg' } });
  expect(screen.getByDisplayValue('Chicken')).toBeInTheDocument();
  expect(screen.getByDisplayValue('1 kg')).toBeInTheDocument();
  expect(screen.queryByLabelText(/Stock Quantity/i)).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Catalog Visibility/i)).toBeEnabled();
});

test('variant products remain draft until customer variant browsing is ready', () => {
  render(<Harness variantCapabilities={{ enabled: true, customerBrowsingEnabled: false }} startingForm={{ ...initial, productMode: 'simple', normalizedVariants: [] }}/>);
  fireEvent.click(screen.getByRole('button', { name: /Product With Variants/i }));
  expect(screen.getByLabelText(/Catalog Visibility/i)).toBeDisabled();
  expect(screen.getByLabelText(/Catalog Visibility/i)).toHaveValue('draft');
  expect(screen.getByText(/Saved as Draft until customer variant browsing is activated/i)).toBeInTheDocument();
});

test('legacy products remain editable while clearly identifying a missing weight', () => {
  render(<Harness editingProduct={{ _id: 'legacy-product' }} startingForm={{ ...initial, weight: '' }}/>);
  expect(screen.getByText(/Legacy product: add a measured weight/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Save Changes/i })).toBeEnabled();
});

test('new simple products accept a manual opening stock quantity', () => {
  render(<Harness startingForm={{ ...initial, stockQuantity: 0 }} />);
  const stock = screen.getByLabelText(/Stock Quantity/i);
  expect(stock).not.toHaveAttribute('readonly');
  expect(stock).toHaveAttribute('min', '0');
  expect(stock).toHaveAttribute('step', '1');
  fireEvent.change(stock, { target: { value: '24' } });
  expect(stock).toHaveValue(24);
  expect(screen.getByText(/opening inventory balance/i)).toBeInTheDocument();
});

test('Store-added products allow direct stock edits while keeping the established selling unit locked', () => {
  render(<Harness editingProduct={{ _id: 'existing-product' }} />);
  const stock = screen.getByLabelText(/Stock Quantity/i);
  expect(stock).not.toHaveAttribute('readonly');
  fireEvent.change(stock, { target: { value: '18' } });
  expect(stock).toHaveValue(18);
  expect(screen.getByRole('combobox', { name: /Selling Unit/i })).toBeDisabled();
  expect(screen.getAllByText(/Store-added product/i)).toHaveLength(2);
  expect(screen.getByText(/Locked because existing inventory and orders use this unit/i)).toBeInTheDocument();
});

test('supplier-sourced product stock stays locked until another purchase is received', () => {
  render(<Harness editingProduct={{ _id: 'supplier-product', supplierProductRef: 'supplier-catalog-item' }} />);
  expect(screen.getByLabelText(/Stock Quantity/i)).toHaveAttribute('readonly');
  expect(screen.getByText(/repurchase and receive the item/i)).toBeInTheDocument();
});
