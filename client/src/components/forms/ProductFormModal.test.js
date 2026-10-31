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
  render(<Harness variantCapabilities={{ enabled: true }} startingForm={{ ...initial, productMode: 'simple', normalizedVariants: [] }}/>);
  fireEvent.click(screen.getByRole('button', { name: /Product With Variants/i }));
  expect(screen.getByText(/Add only combinations you actually sell/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Add explicit combination/i }));
  fireEvent.change(screen.getByPlaceholderText(/Flavor, Size, Color/i), { target: { value: 'Flavor' } });
  fireEvent.change(screen.getByPlaceholderText(/Chicken, 1 kg, Blue/i), { target: { value: 'Chicken' } });
  fireEvent.click(screen.getByRole('button', { name: /Add another option/i }));
  fireEvent.change(screen.getByPlaceholderText(/Size, Weight, Packaging/i), { target: { value: 'Size' } });
  fireEvent.change(screen.getByPlaceholderText(/1 kg, 500 mL, Box/i), { target: { value: '1 kg' } });
  expect(screen.getByDisplayValue('Chicken')).toBeInTheDocument();
  expect(screen.getByDisplayValue('1 kg')).toBeInTheDocument();
  expect(screen.queryByLabelText(/Stock Quantity/i)).not.toBeInTheDocument();
});

test('legacy products remain editable while clearly identifying a missing weight', () => {
  render(<Harness editingProduct={{ _id: 'legacy-product' }} startingForm={{ ...initial, weight: '' }}/>);
  expect(screen.getByText(/Legacy product: add a measured weight/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Save Changes/i })).toBeEnabled();
});
