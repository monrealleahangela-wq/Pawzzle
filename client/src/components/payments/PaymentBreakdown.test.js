import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import PaymentBreakdown from './PaymentBreakdown';
import { bookingPaymentSummary, orderPaymentSummary } from '../../utils/paymentSummary';

describe('context-aware payment breakdown', () => {
  test('product orders show their delivery and VAT details without service or booking rows', () => {
    const summary = orderPaymentSummary({
      deliveryMethod: 'delivery',
      paymentMethod: 'paymongo',
      paymentStatus: 'paid',
      pricingBreakdown: {
        calculationVersion: 1,
        subtotal: 1000,
        taxStatus: 'vat_registered',
        pricingMode: 'inclusive',
        vatRatePercent: 12,
        vatAmount: 107.14,
        deliveryFee: 125,
        serviceFee: 30,
        bookingFee: 20,
        finalTotal: 1125
      },
      deliveryFeeCalculation: {
        distanceKm: 5.5,
        breakdown: {
          baseFee: 50,
          ratePerKilometer: 15,
          billableKilometers: 5,
          distanceCharge: 75,
          additionalItemQuantity: 0,
          additionalItemFee: 10,
          itemCharge: 0
        }
      }
    });

    render(<PaymentBreakdown summary={summary} />);

    expect(screen.getByText('Product subtotal')).toBeInTheDocument();
    expect(screen.getByText('VAT included (12%)')).toBeInTheDocument();
    expect(screen.getByText('Shipping distance')).toBeInTheDocument();
    expect(screen.getByText('5.50 km')).toBeInTheDocument();
    expect(screen.getByText('Base delivery fee')).toBeInTheDocument();
    expect(screen.getByText(/Distance charge/)).toBeInTheDocument();
    expect(screen.getByText('Delivery total')).toBeInTheDocument();
    expect(screen.queryByText('Service fee')).not.toBeInTheDocument();
    expect(screen.queryByText('Booking fee')).not.toBeInTheDocument();
  });

  test('non-VAT product orders show a semantic status rather than a zero VAT charge', () => {
    const summary = orderPaymentSummary({
      deliveryMethod: 'pickup',
      pricingBreakdown: {
        calculationVersion: 1,
        subtotal: 400,
        taxStatus: 'non_vat',
        vatAmount: 0,
        deliveryFee: 0,
        finalTotal: 400
      }
    });

    render(<PaymentBreakdown summary={summary} />);

    expect(screen.getByText('Tax status')).toBeInTheDocument();
    expect(screen.getByText('Non-VAT')).toBeInTheDocument();
    expect(screen.queryByText(/VAT \/ Tax \(Non-VAT\)/)).not.toBeInTheDocument();
    expect(screen.queryByText('Delivery')).not.toBeInTheDocument();
  });

  test('a genuinely free product delivery remains visible as Free', () => {
    const summary = orderPaymentSummary({
      deliveryMethod: 'delivery',
      pricingBreakdown: {
        calculationVersion: 1,
        subtotal: 400,
        taxStatus: 'non_vat',
        vatAmount: 0,
        deliveryFee: 0,
        finalTotal: 400
      }
    });

    render(<PaymentBreakdown summary={summary} />);

    expect(screen.getByText('Delivery')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
  });

  test('service bookings retain genuine booking, service, home-service, and additional charges', () => {
    const summary = bookingPaymentSummary({
      paymentMethod: 'paymongo',
      paymentStatus: 'pending',
      pricingBreakdown: {
        calculationVersion: 1,
        basePrice: 500,
        serviceFee: 25,
        bookingFee: 50,
        homeServiceFee: 100,
        conditionFees: 20,
        taxStatus: 'non_vat',
        vatAmount: 0,
        finalTotal: 695
      }
    });

    render(<PaymentBreakdown summary={summary} />);

    expect(screen.getByText('Service price')).toBeInTheDocument();
    expect(screen.getByText('Service fee')).toBeInTheDocument();
    expect(screen.getByText('Booking fee')).toBeInTheDocument();
    expect(screen.getByText('Home service fee')).toBeInTheDocument();
    expect(screen.getByText('Additional service charges')).toBeInTheDocument();
  });

  test('historical product orders render without inventing unavailable taxes or charges', () => {
    const summary = orderPaymentSummary({
      items: [{ price: 200, quantity: 2 }],
      totalAmount: 400
    });

    render(<PaymentBreakdown summary={summary} />);

    expect(screen.getByText('Product subtotal')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('VAT / Tax')).not.toBeInTheDocument();
    expect(screen.queryByText('Additional charges')).not.toBeInTheDocument();
  });
});
