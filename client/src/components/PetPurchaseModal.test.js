import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import PetPurchaseModal from './PetPurchaseModal';

const pet = {
  _id: 'pet-1', name: 'Pochi', species: 'mouse', breed: 'Fancy Mouse',
  price: 2800, paymentConfig: 'full_payment'
};
const store = {
  _id: 'store-1', name: 'Pawzzle South',
  contactInfo: { address: { barangay: 'San Roque', city: 'Antipolo' } },
  refundPolicy: { type: 'conditional_refund', summary: 'Refunds are reviewed before pickup.', conditions: 'Contact the Store within 24 hours.' }
};

test('pet checkout shows authoritative listing context without inquiry screening fields', () => {
  render(<PetPurchaseModal isOpen pet={pet} store={store} buyer={{ firstName: 'Ari', lastName: 'Buyer' }} onClose={jest.fn()} onSubmit={jest.fn()} />);

  const checkoutHeading = screen.getByRole('heading', { name: 'Pet Purchase Checkout' });
  const paymentHeading = screen.getByRole('heading', { name: 'Payment summary' });
  expect(checkoutHeading).toHaveClass('pet-purchase-modal__hero-title');
  expect(paymentHeading).toHaveClass('pet-purchase-modal__section-title--dark');
  expect(screen.getByText(/Pochi · Fancy Mouse/)).toBeInTheDocument();
  expect(screen.getByText('Pawzzle South')).toBeInTheDocument();
  expect(screen.getAllByText('₱2,800.00').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText('Conditional Refund policy')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Proceed to Payment' })).toBeInTheDocument();
  expect(screen.queryByText(/Purchase Inquiry|Send inquiry|Why are you interested|Previous Experience/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: /refund/i })).not.toBeInTheDocument();
});

test('keeps close and payment actions available outside the scrolling form', () => {
  const onClose = jest.fn();
  render(<PetPurchaseModal isOpen pet={pet} store={store} buyer={{ firstName: 'Ari', lastName: 'Buyer' }} onClose={onClose} onSubmit={jest.fn()} />);

  const dialog = screen.getByRole('dialog', { name: 'Pet Purchase Checkout' });
  const form = document.getElementById('pet-purchase-form');
  const closeButton = screen.getByRole('button', { name: 'Close pet checkout' });
  const paymentButton = screen.getByRole('button', { name: 'Proceed to Payment' });

  expect(dialog.parentElement).toBe(document.body);
  expect(form).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
  expect(closeButton).not.toBeDisabled();
  expect(paymentButton.closest('footer')).toHaveClass('pet-purchase-modal__footer');

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('no-refund policy is acknowledged only when applicable and submitted with a stable request key', () => {
  const onSubmit = jest.fn();
  render(<PetPurchaseModal
    isOpen
    pet={{ ...pet, paymentConfig: 'deposit_first', depositAmount: 800 }}
    store={{ ...store, refundPolicy: { type: 'no_refund', summary: 'Reservation deposits are not refundable.' } }}
    buyer={{ firstName: 'Ari', lastName: 'Buyer', phone: '09171234567' }}
    onClose={jest.fn()}
    onSubmit={onSubmit}
  />);

  fireEvent.change(screen.getByLabelText('City / Area'), { target: { value: 'Antipolo' } });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pickupDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  fireEvent.change(screen.getByLabelText('Preferred pickup'), { target: { value: pickupDate } });
  fireEvent.click(screen.getByRole('checkbox', { name: /pickup only/i }));
  fireEvent.click(screen.getByRole('checkbox', { name: /no-refund policy/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Proceed to Payment' }));

  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    fullName: 'Ari Buyer', contactNumber: '09171234567', cityArea: 'Antipolo',
    preferredPickupDate: pickupDate, pickupConfirmation: true,
    refundPolicyAcknowledged: true, paymentMethod: 'paymongo',
    purchaseRequestId: expect.any(String)
  }));
});
