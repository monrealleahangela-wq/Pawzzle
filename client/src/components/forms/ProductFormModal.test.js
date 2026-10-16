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

const Harness = ({ editingProduct, startingForm = initial }) => {
  const [form, setForm] = React.useState(startingForm);
  return <ProductFormModal editingProduct={editingProduct} form={form} setForm={setForm} onClose={jest.fn()} onSubmit={event => event.preventDefault()} onImageUpload={jest.fn()} loading={false} onAdvanced={jest.fn()}/>;
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

test('legacy products remain editable while clearly identifying a missing weight', () => {
  render(<Harness editingProduct={{ _id: 'legacy-product' }} startingForm={{ ...initial, weight: '' }}/>);
  expect(screen.getByText(/Legacy product: add a measured weight/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Save Changes/i })).toBeEnabled();
});
