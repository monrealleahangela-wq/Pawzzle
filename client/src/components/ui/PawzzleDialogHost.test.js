import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PawzzleDialogHost from './PawzzleDialogHost';
import {
  pawzzleAlert,
  pawzzleConfirm,
  pawzzlePrompt,
  resetPawzzleDialogsForTests
} from '../../utils/pawzzleDialog';

afterEach(() => resetPawzzleDialogsForTests());

test('renders a branded confirmation and returns the confirmed choice', async () => {
  render(<PawzzleDialogHost />);
  let result;
  act(() => {
    result = pawzzleConfirm('Apply the reviewed attendance correction?', {
      title: 'Approve attendance correction',
      confirmLabel: 'Approve and apply',
      tone: 'warning'
    });
  });

  expect(screen.getByRole('dialog', { name: 'Approve attendance correction' })).not.toBeNull();
  expect(screen.getByText('Apply the reviewed attendance correction?')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Approve and apply' }));
  await expect(result).resolves.toBe(true);
});

test('returns false when a confirmation is cancelled', async () => {
  render(<PawzzleDialogHost />);
  let result;
  act(() => { result = pawzzleConfirm('Continue?'); });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await expect(result).resolves.toBe(false);
});

test('validates required prompt text before resolving', async () => {
  render(<PawzzleDialogHost />);
  let result;
  act(() => {
    result = pawzzlePrompt('Enter the review basis.', {
      title: 'Review attendance correction',
      inputLabel: 'Review basis',
      required: true,
      minLength: 5,
      multiline: true
    });
  });

  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('alert').textContent).toContain('required details');

  fireEvent.change(screen.getByLabelText('Review basis'), { target: { value: 'Verified evidence and shift record.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await expect(result).resolves.toBe('Verified evidence and shift record.');
});

test('shows queued dialogs one at a time', async () => {
  render(<PawzzleDialogHost />);
  let first;
  let second;
  act(() => {
    first = pawzzleAlert('First notice', { title: 'First' });
    second = pawzzleConfirm('Second notice', { title: 'Second' });
  });

  expect(screen.getByRole('dialog', { name: 'First' })).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
  await expect(first).resolves.toBeUndefined();
  expect(screen.getByRole('dialog', { name: 'Second' })).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await expect(second).resolves.toBe(true);
});

test('Escape safely cancels a prompt', async () => {
  render(<PawzzleDialogHost />);
  let result;
  act(() => { result = pawzzlePrompt('Optional note'); });
  fireEvent.keyDown(document, { key: 'Escape' });
  await expect(result).resolves.toBeNull();
});
