import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConfirmationDialog from './ConfirmationDialog';

describe('ConfirmationDialog', () => {
  test('moves focus into the dialog and preserves confirm/cancel behavior', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmationDialog
        isOpen
        title="Update order status?"
        description="The customer will see the new status."
        confirmLabel="Update status"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Update order status?' })).toHaveAccessibleDescription('The customer will see the new status.');
    expect(screen.getByRole('dialog').closest('[data-modal-viewport="true"]').parentElement).toBe(document.body);
    expect(document.body.style.overflow).toBe('hidden');
    const confirm = screen.getByRole('button', { name: 'Update status' });
    await waitFor(() => expect(confirm).toHaveFocus());
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  test('Escape invokes cancel without confirming', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<ConfirmationDialog isOpen title="Cancel order?" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
