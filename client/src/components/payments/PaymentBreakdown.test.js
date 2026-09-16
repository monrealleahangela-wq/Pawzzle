import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import PaymentBreakdown from './PaymentBreakdown';
import { bookingPaymentSummary, orderLineItemRows, orderPaymentSummary, paymentSummaryRows } from '../../utils/paymentSummary';

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
        vatExclusiveAmount: 892.86,
        vatAmount: 107.14,
        deliveryFeeTaxable: false,
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

    expect(screen.getByText('Product subtotal (VAT-inclusive)')).toBeInTheDocument();
    expect(screen.getByText('Price before VAT')).toBeInTheDocument();
    expect(screen.getByText('VAT (12%, included)')).toBeInTheDocument();
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
      totalAmount: 400,
      // Mirrors Mongoose defaults applied while hydrating a pre-snapshot Order.
      pricingBreakdown: {
        subtotal: 0,
        finalTotal: 0,
        taxStatus: 'non_vat',
        pricingMode: 'inclusive',
        vatAmount: 0
      }
    });

    render(<PaymentBreakdown summary={summary} />);

    expect(screen.getByText('Product subtotal')).toBeInTheDocument();
    expect(screen.getAllByText('₱400.00')).toHaveLength(2);
    expect(screen.getByText('Total to Pay')).toBeInTheDocument();
    expect(screen.queryByText('Non-VAT')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('VAT / Tax')).not.toBeInTheDocument();
    expect(screen.queryByText('Additional charges')).not.toBeInTheDocument();
    expect(screen.getByText('Detailed tax breakdown unavailable for this historical order')).toBeInTheDocument();
  });

  test('VAT-inclusive ₱1,120 is decomposed without increasing the total', () => {
    const summary = orderPaymentSummary({
      items: [{ itemId: 'food', name: 'Dog Food', itemType: 'product', price: 560, quantity: 2 }],
      pricingBreakdown: {
        calculationVersion: 1,
        subtotal: 1120,
        discountedSubtotal: 1120,
        taxStatus: 'vat_registered',
        pricingMode: 'inclusive',
        vatRatePercent: 12,
        vatExclusiveAmount: 1000,
        vatAmount: 120,
        deliveryFee: 0,
        deliveryFeeTaxable: false,
        finalTotal: 1120
      }
    });

    render(<PaymentBreakdown summary={summary} />);

    expect(screen.getByText('Product subtotal (VAT-inclusive)')).toBeInTheDocument();
    expect(screen.getByText('Price before VAT')).toBeInTheDocument();
    expect(screen.getByText('VAT (12%, included)')).toBeInTheDocument();
    expect(screen.getAllByText('₱1,120.00')).toHaveLength(2);
    expect(screen.getByText('₱1,000.00')).toBeInTheDocument();
    expect(screen.getByText('₱120.00')).toBeInTheDocument();
  });

  test('line items reconcile and discounts appear before the authoritative VAT decomposition', () => {
    const lines = orderLineItemRows([
      { itemId: 'a', name: 'Product A', price: 500, quantity: 2 },
      { itemId: 'b', name: 'Product B', price: 250, quantity: 1 }
    ]);
    expect(lines.map(line => line.lineTotal)).toEqual([1000, 250]);
    expect(lines.reduce((sum, line) => sum + line.lineTotal, 0)).toBe(1250);

    const rows = paymentSummaryRows(orderPaymentSummary({
      items: lines,
      deliveryMethod: 'delivery',
      pricingBreakdown: {
        calculationVersion: 1,
        subtotal: 1250,
        discountAmount: 130,
        discountedSubtotal: 1120,
        taxStatus: 'vat_registered',
        pricingMode: 'inclusive',
        vatRatePercent: 12,
        vatExclusiveAmount: 1000,
        vatAmount: 120,
        deliveryFee: 80,
        deliveryFeeTaxable: false,
        finalTotal: 1200
      }
    }));
    const keys = rows.map(row => row.key);
    expect(keys.indexOf('discount')).toBeLessThan(keys.indexOf('vat-exclusive'));
    expect(keys.indexOf('vat')).toBeLessThan(keys.indexOf('delivery-total'));
    expect(rows.find(row => row.key === 'delivery-tax-treatment').displayValue).toBe('Not included in VAT calculation');
  });
});
