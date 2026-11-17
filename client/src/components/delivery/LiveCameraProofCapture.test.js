import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LiveCameraProofCapture from './LiveCameraProofCapture';

const originalMediaDevices = navigator.mediaDevices;

const Harness = ({ upload }) => {
  const [proof, setProof] = useState({ photo: '', capturedAt: '' });
  const capture = async file => {
    await upload(file);
    setProof({ photo: 'https://example.test/live-proof.jpg', capturedAt: '2026-11-17T08:00:00.000Z' });
  };
  return <LiveCameraProofCapture
    photo={proof.photo}
    capturedAt={proof.capturedAt}
    onCapture={capture}
    onClear={() => setProof({ photo: '', capturedAt: '' })}
  />;
};

describe('LiveCameraProofCapture', () => {
  let stop;

  beforeEach(() => {
    stop = jest.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) }
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: jest.fn().mockResolvedValue(undefined)
    });
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({ drawImage: jest.fn() }));
    HTMLCanvasElement.prototype.toBlob = jest.fn(callback => callback(new Blob(['live-frame'], { type: 'image/jpeg' })));
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalMediaDevices });
    jest.restoreAllMocks();
  });

  test('captures a frame from getUserMedia and offers a retake after upload', async () => {
    const upload = jest.fn().mockResolvedValue(undefined);
    render(<Harness upload={upload}/>);

    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open live camera' }));
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false })));

    const video = await screen.findByLabelText('Live camera preview');
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 640 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 480 });
    fireEvent.canPlay(video);
    fireEvent.click(screen.getByRole('button', { name: 'Capture delivery photo' }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][0]).toEqual(expect.objectContaining({ type: 'image/jpeg' }));
    expect(await screen.findByText('Live photo captured')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retake' })).toBeInTheDocument();
    expect(stop).toHaveBeenCalled();
  });

  test('shows a recoverable permission error without providing a gallery fallback', async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValue(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    render(<LiveCameraProofCapture onCapture={jest.fn()}/>);

    fireEvent.click(screen.getByRole('button', { name: 'Open live camera' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Camera permission was blocked');
    expect(screen.getByRole('button', { name: 'Retry live camera' })).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });
});
