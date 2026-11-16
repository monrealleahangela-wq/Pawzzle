import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import ResolutionLogisticsTimeline from './ResolutionLogisticsTimeline';

test('shows the reverse return and forward correction shipment progress with tracking', () => {
  render(<ResolutionLogisticsTimeline resolution={{
    returnShipment: { status: 'received', carrier: 'Return Carrier', trackingNumber: 'RETURN-123' },
    replacementShipment: { status: 'shipped', carrier: 'Correction Carrier', trackingNumber: 'CORRECT-456' }
  }} />);

  expect(screen.getByLabelText('Resolution delivery timeline')).toBeInTheDocument();
  expect(screen.getByText('Return shipment')).toBeInTheDocument();
  expect(screen.getByText('Replacement / correction')).toBeInTheDocument();
  expect(screen.getByText(/RETURN-123/)).toBeInTheDocument();
  expect(screen.getByText(/CORRECT-456/)).toBeInTheDocument();
  expect(screen.getAllByText('shipped')).toHaveLength(3);
});

test('does not render logistics for a resolution that has no physical shipment', () => {
  const { container } = render(<ResolutionLogisticsTimeline resolution={{
    returnShipment: { status: 'not_required' },
    replacementShipment: { status: 'not_required' }
  }} />);
  expect(container).toBeEmptyDOMElement();
});
