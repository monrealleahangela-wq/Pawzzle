import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing, { FAQ_ITEMS } from './Landing';
import { publicService } from '../../services/apiService';

jest.mock('../../services/apiService', () => ({
  publicService: { getLandingData: jest.fn() },
  getImageUrl: value => value
}));

const landingResponse = {
  data: {
    pets: [],
    products: [],
    services: [],
    experts: [],
    stats: { stores: 0, pets: 0, experts: 0, products: 0, services: 0 }
  }
};

const renderLanding = () => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Landing />
  </MemoryRouter>
);

beforeEach(() => {
  publicService.getLandingData.mockReset();
  publicService.getLandingData.mockResolvedValue(landingResponse);
});

test('renders predefined FAQ questions and answers in accessible expandable controls', async () => {
  const { container } = renderLanding();

  expect(await screen.findByRole('heading', { name: 'Frequently asked questions.' })).toBeInTheDocument();
  const accordions = container.querySelectorAll('.landing-faq-list details');
  expect(accordions).toHaveLength(FAQ_ITEMS.length);
  expect(accordions[0]).toHaveAttribute('open');

  FAQ_ITEMS.forEach(({ question, answer }) => {
    expect(screen.getByText(question)).toBeInTheDocument();
    expect(screen.getByText(answer)).toBeInTheDocument();
  });

  const secondSummary = accordions[1].querySelector('summary');
  fireEvent.click(secondSummary);
  expect(accordions[1]).toHaveAttribute('open');
});

test('automatically generates matching FAQ metadata and landing-page navigation', async () => {
  const { container } = renderLanding();
  await screen.findByRole('heading', { name: 'Frequently asked questions.' });

  const schema = JSON.parse(container.querySelector('script[type="application/ld+json"]').textContent);
  expect(schema['@type']).toBe('FAQPage');
  expect(schema.mainEntity).toHaveLength(FAQ_ITEMS.length);
  expect(schema.mainEntity.map(item => item.name)).toEqual(FAQ_ITEMS.map(item => item.question));
  expect(schema.mainEntity.map(item => item.acceptedAnswer.text)).toEqual(FAQ_ITEMS.map(item => item.answer));

  screen.getAllByRole('link', { name: 'FAQ' }).forEach(link => {
    expect(link).toHaveAttribute('href', '#faq');
  });
});
