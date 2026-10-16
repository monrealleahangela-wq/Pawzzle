import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrderReviewModal from './OrderReviewModal';
import { reviewService } from '../services/apiService';

jest.mock('../services/apiService', () => ({
  reviewService: { createReview: jest.fn() },
  getImageUrl: value => value
}));
jest.mock('./ui/Modal', () => ({ isOpen, title, children }) => isOpen ? <section aria-label={title}>{children}</section> : null);
jest.mock('./ImageUpload', () => ({ onImagesChange }) => (
  <button type="button" onClick={() => onImagesChange(['https://images.test/review.jpg'])}>Add test photo</button>
));

const first = {
  _id: '507f1f77bcf86cd799439021',
  itemId: '507f1f77bcf86cd799439011',
  itemType: 'product', name: 'Dog Food', image: '/dog-food.jpg'
};
const second = {
  _id: '507f1f77bcf86cd799439022',
  itemId: '507f1f77bcf86cd799439012',
  itemType: 'product', name: 'Cat Toy', image: '/cat-toy.jpg'
};

beforeEach(() => {
  jest.clearAllMocks();
  reviewService.createReview.mockResolvedValue({ data: { review: { _id: 'review-1' } } });
});

test('submits exact purchased product and order-item context with photos and anonymous mode', async () => {
  const onSubmitted = jest.fn();
  render(<OrderReviewModal isOpen item={first} orderId="order-1" onClose={jest.fn()} onReviewSubmitted={onSubmitted} />);
  expect(screen.getByRole('region', { name: 'REVIEW PRODUCT' })).toBeInTheDocument();
  expect(screen.getByText('Dog Food')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Rate 4 out of 5 stars' }));
  fireEvent.change(screen.getByPlaceholderText('How was the quality?'), { target: { value: 'Good purchased product' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add test photo' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
  await waitFor(() => expect(reviewService.createReview).toHaveBeenCalledWith(expect.objectContaining({
    targetType: 'Product', targetId: first.itemId, orderId: 'order-1', orderItemId: first._id,
    rating: 4, comment: 'Good purchased product', images: ['https://images.test/review.jpg'], isAnonymous: true
  })));
  await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
});

test('switching products resets product-specific form state', () => {
  const view = render(<OrderReviewModal isOpen item={first} orderId="order-1" onClose={jest.fn()} onReviewSubmitted={jest.fn()} />);
  fireEvent.change(screen.getByPlaceholderText('How was the quality?'), { target: { value: 'First item text' } });
  fireEvent.click(screen.getByRole('button', { name: 'Rate 2 out of 5 stars' }));
  view.rerender(<OrderReviewModal isOpen item={second} orderId="order-1" onClose={jest.fn()} onReviewSubmitted={jest.fn()} />);
  expect(screen.getByText('Cat Toy')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('How was the quality?')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Rate 5 out of 5 stars' }).querySelector('svg')).toHaveClass('fill-secondary-400');
});
