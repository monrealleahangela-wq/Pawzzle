import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LiveIdentitySelfieCapture from './LiveIdentitySelfieCapture';

test('captures a camera-only JPEG and stops the stream', async () => {
  const stop = jest.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
  HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({ drawImage: jest.fn() }));
  HTMLCanvasElement.prototype.toBlob = jest.fn(callback => callback(new Blob(['selfie'], { type: 'image/jpeg' })));
  const onCapture = jest.fn();
  const { container } = render(<LiveIdentitySelfieCapture value={null} onCapture={onCapture} />);

  fireEvent.click(screen.getByRole('button', { name: /start camera/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /capture selfie/i })).toBeInTheDocument());
  const video = container.querySelector('video');
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 });
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 });
  fireEvent.click(screen.getByRole('button', { name: /capture selfie/i }));

  expect(onCapture).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/jpeg' }));
  expect(onCapture.mock.calls[0][0].name).toMatch(/^identity-live-selfie-\d+\.jpg$/);
  expect(stop).toHaveBeenCalled();
});
