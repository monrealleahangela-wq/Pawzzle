import { notificationDestination } from './notificationNavigation';

const storeNotice = { relatedModel: 'Conversation', targetUrl: '/admin/supplier-messages?conversation=abc' };
const supplierNotice = { relatedModel: 'Conversation', targetUrl: '/supplier/messages?conversation=abc' };

test('Supplier chat notification links are limited to the intended portal role', () => {
  expect(notificationDestination(storeNotice, { role: 'admin' })).toBe(storeNotice.targetUrl);
  expect(notificationDestination(storeNotice, { role: 'supplier' })).toBeNull();
  expect(notificationDestination(storeNotice, { role: 'customer' })).toBeNull();
  expect(notificationDestination(supplierNotice, { role: 'supplier' })).toBe(supplierNotice.targetUrl);
  expect(notificationDestination(supplierNotice, { role: 'admin' })).toBeNull();
  expect(notificationDestination({ ...supplierNotice, targetUrl: '//evil.example' }, { role: 'supplier' })).toBeNull();
});
