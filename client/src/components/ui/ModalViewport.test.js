import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LogoutModal from '../auth/LogoutModal';
import { CompactFormModal } from '../forms/CompactEntityForm';

const LogoutHarness = ({ onConfirm = jest.fn() }) => {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Open logout</button>
    <LogoutModal isOpen={open} onClose={() => setOpen(false)} onConfirm={onConfirm} />
  </>;
};

describe('viewport modal behavior', () => {
  test('opens Logout in a body portal, locks background scrolling, and restores focus on close', async () => {
    render(<LogoutHarness />);
    const opener = screen.getByRole('button', { name: 'Open logout' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Logout' });
    const viewport = dialog.closest('[data-modal-viewport="true"]');
    expect(viewport).toBeTruthy();
    expect(viewport.parentElement).toBe(document.body);
    expect(viewport).toHaveClass('fixed', 'inset-0', 'items-center', 'h-[100dvh]');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(screen.getByRole('button', { name: 'Logout' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
    expect(opener).toHaveFocus();
  });

  test('remains viewport-fixed when the underlying document is already scrolled', () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 900 });
    render(<LogoutModal isOpen onClose={jest.fn()} onConfirm={jest.fn()} />);

    const viewport = screen.getByRole('dialog', { name: 'Logout' }).closest('[data-modal-viewport="true"]');
    expect(window.scrollY).toBe(900);
    expect(viewport.parentElement).toBe(document.body);
    expect(viewport).toHaveClass('fixed', 'inset-0');
    expect(viewport.className).not.toMatch(/top-|mt-/);
  });

  test('uses dynamic viewport bounds and keeps both Logout actions available on mobile', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 667 });
    render(<LogoutModal isOpen onClose={jest.fn()} onConfirm={jest.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Logout' });
    expect(dialog).toHaveClass('max-h-[calc(100dvh-1.5rem)]', 'overflow-hidden');
    expect(screen.getByRole('button', { name: 'Logout' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('keeps long-form content internally scrollable with persistent actions', () => {
    const onClose = jest.fn();
    render(
      <CompactFormModal
        title="Edit staff"
        subtitle="Profile and assignment settings"
        formId="staff-form"
        onClose={onClose}
        onSubmit={event => event.preventDefault()}
        saveLabel="Save staff"
      >
        <div style={{ height: 1800 }}>Long form content</div>
      </CompactFormModal>
    );

    const dialog = screen.getByRole('dialog', { name: 'Edit staff' });
    const form = document.getElementById('staff-form');
    expect(dialog.closest('[data-modal-viewport="true"]').parentElement).toBe(document.body);
    expect(dialog).toHaveClass('max-h-[100dvh]', 'overflow-hidden');
    expect(form).toHaveClass('min-h-0', 'overflow-y-auto', 'overscroll-contain');
    expect(screen.getByRole('button', { name: 'Save staff' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('preserves confirm and Escape-close behavior', async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    const { rerender } = render(<LogoutModal isOpen onClose={onClose} onConfirm={onConfirm} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    rerender(<LogoutModal isOpen onClose={onClose} onConfirm={onConfirm} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
