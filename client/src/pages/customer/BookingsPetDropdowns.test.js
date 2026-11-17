import fs from 'fs';

const source = fs.readFileSync(__dirname + '/Bookings.js', 'utf8');

describe('customer booking pet dropdown contract', () => {
  test('renders correlated pet type and breed selects', () => {
    expect(source).toMatch(/<select[\s\S]*?id="booking-pet-type"[\s\S]*?name="pet\.type"/);
    expect(source).toMatch(/<select[\s\S]*?id="booking-pet-breed"[\s\S]*?name="pet\.breed"/);
    expect(source).toMatch(/getBreedOptions\(bookingForm\.pet\.type\)\.map/);
  });

  test('clears the breed whenever the manual pet type changes', () => {
    expect(source).toMatch(/name === 'pet\.type' \? \{ breed: '' \} : \{\}/);
  });
});
