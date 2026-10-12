import fs from 'fs';
import path from 'path';

const profileSource = fs.readFileSync(path.join(__dirname, 'Profile.js'), 'utf8');

test('customer profile uses a bounded responsive sidebar and flexible activity column', () => {
  expect(profileSource).toContain('data-testid="customer-profile-layout"');
  expect(profileSource).toContain('lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]');
  expect(profileSource).toContain('data-testid="customer-profile-sidebar"');
  expect(profileSource).toContain('data-testid="customer-profile-content"');
  expect(profileSource).toContain('grid grid-cols-1 gap-3 sm:grid-cols-2');
  expect(profileSource).not.toContain('lg:col-span-4 space-y-3');
  expect(profileSource).not.toContain('sm:min-h-[600px]');
});
