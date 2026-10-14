import React, { useMemo } from 'react';
import { BarcodeFormat, QRCodeWriter } from 'html5-qrcode/third_party/zxing-js.umd.js';

const buildPath = matrix => {
  const commands = [];
  for (let y = 0; y < matrix.getHeight(); y += 1) {
    for (let x = 0; x < matrix.getWidth(); x += 1) {
      if (matrix.get(x, y)) commands.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return commands.join('');
};

export const createReservationQrPath = value => {
  if (typeof value !== 'string' || !value) return '';
  const matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 256, 256, new Map());
  return buildPath(matrix);
};

const ReservationQrCode = ({ value, className = '' }) => {
  const path = useMemo(() => createReservationQrPath(value), [value]);
  if (!path) return null;
  return (
    <svg role="img" aria-label="Reservation verification QR code" viewBox="0 0 256 256" shapeRendering="crispEdges" className={className}>
      <rect width="256" height="256" fill="white" />
      <path d={path} fill="#111827" />
    </svg>
  );
};

export default ReservationQrCode;
