import fs from 'fs';
import path from 'path';

const profileSource = fs.readFileSync(path.join(__dirname, 'Profile.js'), 'utf8');
const globalStyles = fs.readFileSync(path.join(__dirname, '../../index.css'), 'utf8');

test('customer profile uses a bounded responsive sidebar and flexible activity column', () => {
  expect(profileSource).toContain('data-testid="customer-profile-layout"');
  expect(profileSource).toContain('lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]');
  expect(profileSource).toContain('data-testid="customer-profile-sidebar"');
  expect(profileSource).toContain('data-testid="customer-profile-content"');
  expect(profileSource).toContain('grid grid-cols-1 gap-3 sm:grid-cols-2');
  expect(profileSource).not.toContain('lg:col-span-4 space-y-3');
  expect(profileSource).not.toContain('sm:min-h-[600px]');
});

test('shared profile keeps light-mode labels and inactive navigation readable', () => {
  expect(profileSource).toContain("'text-slate-600 hover:bg-neutral-50 hover:text-neutral-900'");
  expect(profileSource).toContain('font-black text-slate-600 uppercase tracking-widest mb-2');
  expect(profileSource).toContain('font-black text-slate-700 px-1 py-1 flex items-center gap-2 italic');

  expect(profileSource).not.toContain('font-black text-neutral-300 uppercase tracking-widest mb-2');
  expect(profileSource).not.toContain('text-slate-400 px-1 py-1 flex items-center gap-2 italic leading-none truncate opacity-60');

  expect(globalStyles).toContain('html:not(.dark) .customer-profile-page .text-slate-300');
  expect(globalStyles).toContain('html:not(.dark) .customer-profile-page .text-neutral-400');
  expect(globalStyles).toContain('color: #475569 !important;');
  expect(globalStyles).toContain('color: #52525b !important;');
});
