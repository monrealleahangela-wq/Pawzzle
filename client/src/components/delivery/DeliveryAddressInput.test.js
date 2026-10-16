import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import DeliveryAddressInput from './DeliveryAddressInput';

const suggestion = {
  place_id: 4321,
  display_name: '12 Demo Street, Imus, Cavite, Philippines',
  lat: '14.4297',
  lon: '120.9367',
  address: { road: 'Demo Street', city: 'Imus', state: 'Cavite', country: 'Philippines', postcode: '4103' }
};

describe('DeliveryAddressInput', () => {
  let searchSuggestions;
  beforeEach(() => {
    jest.useFakeTimers();
    searchSuggestions = jest.fn().mockResolvedValue([suggestion]);
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  const finishSearch = async () => {
    await act(async () => {
      jest.advanceTimersByTime(310);
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  test('shows typed text immediately and clears stale map metadata', async () => {
    const onChange = jest.fn();
    render(<DeliveryAddressInput label="Drop-off address" value={{
      formattedAddress: 'Old address', placeId: 'old-place', coordinates: { lat: 1, lng: 2 }
    }} onChange={onChange} searchSuggestions={searchSuggestions}/>);
    const input = screen.getByRole('combobox', { name: /Drop-off address/i });
    fireEvent.change(input, { target: { value: 'New delivery address' } });
    expect(input).toHaveValue('New delivery address');
    expect(onChange).toHaveBeenLastCalledWith({ formattedAddress: 'New delivery address' });
    expect(onChange.mock.calls.at(-1)[0]).not.toHaveProperty('coordinates');
    expect(onChange.mock.calls.at(-1)[0]).not.toHaveProperty('placeId');
    await finishSearch();
    expect(await screen.findByRole('option', { name: suggestion.display_name })).toBeVisible();
  });

  test('supports mouse and keyboard selection and displays the complete selected address', async () => {
    const onChange = jest.fn();
    const { rerender } = render(<DeliveryAddressInput label="Pickup address" value={{ formattedAddress: '' }} onChange={onChange} searchSuggestions={searchSuggestions}/>);
    const input = screen.getByRole('combobox', { name: /Pickup address/i });
    fireEvent.change(input, { target: { value: 'Demo Street' } });
    await finishSearch();
    fireEvent.mouseDown(await screen.findByRole('option', { name: suggestion.display_name }));
    expect(input).toHaveValue(suggestion.display_name);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      formattedAddress: suggestion.display_name,
      placeId: '4321',
      coordinates: { lat: 14.4297, lng: 120.9367 }
    }));

    rerender(<DeliveryAddressInput label="Pickup address" value={{ formattedAddress: '' }} onChange={onChange} searchSuggestions={searchSuggestions}/>);
    fireEvent.change(input, { target: { value: 'Demo Street again' } });
    await finishSearch();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue(suggestion.display_name);
  });

  test('initializes from a saved address and keeps readable layered suggestion styles', async () => {
    render(<DeliveryAddressInput label="Drop-off address" value={{ formattedAddress: 'Saved full address' }} onChange={jest.fn()} searchSuggestions={searchSuggestions}/>);
    const input = screen.getByRole('combobox', { name: /Drop-off address/i });
    expect(input).toHaveValue('Saved full address');
    expect(input.className).toMatch(/bg-white/);
    fireEvent.change(input, { target: { value: 'Saved full address changed' } });
    await finishSearch();
    expect(screen.getByRole('listbox').className).toMatch(/z-\[3000\].*bg-white/);
  });

  test('selecting an authorized saved address preserves its complete stored metadata', async () => {
    const saved = {
      formattedAddress: 'Saved Store Address, Imus, Cavite',
      street: 'Saved Store Address', city: 'Imus', province: 'Cavite',
      placeId: 'saved-place', coordinates: { lat: 14.42, lng: 120.94 }
    };
    const onChange = jest.fn();
    searchSuggestions.mockResolvedValue([saved]);
    render(<DeliveryAddressInput label="Pickup address" value={{ formattedAddress: '' }} onChange={onChange} searchSuggestions={searchSuggestions}/>);
    const input = screen.getByRole('combobox', { name: /Pickup address/i });
    fireEvent.change(input, { target: { value: 'Saved Store' } });
    await finishSearch();
    fireEvent.mouseDown(screen.getByRole('option', { name: saved.formattedAddress }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining(saved));
    expect(input).toHaveValue(saved.formattedAddress);
  });
});
