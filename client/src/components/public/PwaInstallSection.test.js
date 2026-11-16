import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import usePwaInstall from '../../hooks/usePwaInstall';
import PwaInstallSection from './PwaInstallSection';

jest.mock('../../hooks/usePwaInstall');

test('launches the native PWA installation prompt when the browser supplies it', () => {
  const promptInstall = jest.fn();
  usePwaInstall.mockReturnValue({
    canPrompt: true,
    installed: false,
    isPrompting: false,
    lastOutcome: null,
    platform: 'android',
    promptInstall
  });

  render(<PwaInstallSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Install Pawzzle' }));

  expect(promptInstall).toHaveBeenCalledTimes(1);
  expect(screen.getByText('No APK required')).toBeInTheDocument();
});

test('shows clear Android browser-menu instructions when the prompt is unavailable', () => {
  usePwaInstall.mockReturnValue({
    canPrompt: false,
    installed: false,
    isPrompting: false,
    lastOutcome: 'dismissed',
    platform: 'android',
    promptInstall: jest.fn()
  });

  render(<PwaInstallSection />);

  expect(screen.getByRole('heading', { name: 'Download the Pawzzle App' })).toBeInTheDocument();
  expect(screen.getByText('Install from your browser menu')).toBeInTheDocument();
  expect(screen.getByText(/three-dot browser menu/i)).toBeInTheDocument();
  expect(screen.getByText(/Add to Home screen/i)).toBeInTheDocument();
});
