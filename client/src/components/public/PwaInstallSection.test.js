import fs from 'fs';
import path from 'path';
import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import usePwaInstall from '../../hooks/usePwaInstall';
import PwaInstallSection, { PAWZZLE_ANDROID_APK_PATH } from './PwaInstallSection';

jest.mock('../../hooks/usePwaInstall');

test('offers the hosted Android APK as the primary download', () => {
  usePwaInstall.mockReturnValue({
    canPrompt: false,
    installed: false,
    isPrompting: false,
    lastOutcome: null,
    platform: 'android',
    promptInstall: jest.fn()
  });

  render(<PwaInstallSection />);

  const apkLink = screen.getByRole('link', { name: 'Download Pawzzle Android APK' });
  expect(apkLink).toHaveAttribute('href', PAWZZLE_ANDROID_APK_PATH);
  expect(apkLink).toHaveAttribute('download', 'Pawzzle-Android.apk');
  expect(screen.getByText('Direct APK download')).toBeInTheDocument();

  const apk = fs.statSync(path.resolve(__dirname, '../../../public/downloads/Pawzzle-Android.apk'));
  expect(apk.size).toBeGreaterThan(10_000_000);
});

test('keeps the native PWA installation prompt as a secondary option', () => {
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
  fireEvent.click(screen.getByRole('button', { name: 'Add Pawzzle to home screen' }));

  expect(promptInstall).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: 'Download Pawzzle Android APK' })).toBeInTheDocument();
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

  expect(screen.getByRole('heading', { name: 'Download the Pawzzle Android App' })).toBeInTheDocument();
  expect(screen.getByText('Install from your browser menu')).toBeInTheDocument();
  expect(screen.getByText(/three-dot browser menu/i)).toBeInTheDocument();
  expect(screen.getByText(/Add to Home screen/i)).toBeInTheDocument();
});
