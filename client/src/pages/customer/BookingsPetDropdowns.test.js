import fs from 'fs';

const source = fs.readFileSync(__dirname + '/Bookings.js', 'utf8');
const selectMarkup = id => source.match(new RegExp(`<select[\\s\\S]*?id="${id}"[\\s\\S]*?</select>`))?.[0] || '';

describe('customer booking pet dropdown contract', () => {
  test('renders correlated pet type and breed selects', () => {
    expect(source).toMatch(/<select[\s\S]*?id="booking-pet-type"[\s\S]*?name="pet\.type"/);
    expect(source).toMatch(/<select[\s\S]*?id="booking-pet-breed"[\s\S]*?name="pet\.breed"/);
    expect(source).toMatch(/getBreedOptions\(bookingForm\.pet\.type\)\.map/);
  });

  test('clears the breed whenever the manual pet type changes', () => {
    expect(source).toMatch(/name === 'pet\.type' \? \{ breed: '' \} : \{\}/);
  });

  test.each(['booking-pet-type', 'booking-pet-breed'])('%s keeps selected text fully visible', id => {
    const markup = selectMarkup(id);
    expect(markup).toMatch(/className="[^"]*\bh-14\b[^"]*\bpy-0\b[^"]*\bleading-normal\b[^"]*"/);
    expect(markup).not.toMatch(/\bpy-4\b/);
  });
});
