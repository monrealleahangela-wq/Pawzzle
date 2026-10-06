import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import DeliveryConcernForm from './DeliveryConcernForm';

test('delivery concern form exposes labeled controls and submits the allowlisted payload', async () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  render(<DeliveryConcernForm onSubmit={onSubmit} onCancel={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Concern type'), { target: { value: 'damaged_items' } });
  fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: '  Package was damaged.  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit concern' }));
  expect(onSubmit).toHaveBeenCalledWith({ type: 'damaged_items', content: 'Package was damaged.' });
});
