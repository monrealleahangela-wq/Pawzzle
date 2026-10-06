import { getStaffMenu } from './Layout';

const permissionMap = permissions => Object.fromEntries(permissions.map(permission => [permission, true]));
const labels = menu => menu.flatMap(item => [item.label, ...(item.children || []).map(child => child.label)]);

describe('role-specific staff navigation', () => {
  test('Service Staff receives Bookings but not general catalog management', () => {
    const menu = labels(getStaffMenu({
      role: 'service_staff',
      permissions: permissionMap(['customers.view', 'pets.view', 'services.view', 'bookings.view'])
    }));
    expect(menu).toContain('Bookings');
    for (const label of ['Pets', 'Products', 'Services', 'Customers']) expect(menu).not.toContain(label);
  });

  test('Procurement Staff receives procurement without unrelated catalog destinations', () => {
    const menu = labels(getStaffMenu({
      role: 'procurement_officer',
      permissions: permissionMap(['inventory.view', 'procurement.manage', 'finance.view', 'dss.suppliers'])
    }));
    expect(menu).toContain('Purchase Orders');
    for (const label of ['Pets', 'Products', 'Services']) expect(menu).not.toContain(label);
  });

  test('Manager links reflect the management actions granted by RBAC', () => {
    const menu = labels(getStaffMenu({
      role: 'manager',
      permissions: permissionMap([
        'dashboard.view', 'staff.view', 'customers.manage', 'pets.manage',
        'services.manage', 'sales.manage', 'inventory.manage', 'bookings.manage'
      ])
    }));
    expect(menu).toEqual(expect.arrayContaining(['Pets', 'Products', 'Services', 'Customers', 'Staff', 'Orders', 'Bookings']));
  });

  test('Finance stays finance-focused while retaining authorized read-only Orders', () => {
    const menu = labels(getStaffMenu({
      role: 'finance_staff',
      permissions: permissionMap(['sales.view', 'finance.manage', 'payroll.view', 'attendance.view'])
    }));
    expect(menu).toEqual(expect.arrayContaining(['Orders', 'Finance Records', 'Payroll']));
    for (const label of ['Pets', 'Products', 'Services', 'Customers']) expect(menu).not.toContain(label);
  });

  test('Cashier receives the existing Orders workspace without finance administration', () => {
    const menu = labels(getStaffMenu({
      role: 'cashier',
      permissions: permissionMap(['sales.create', 'sales.view', 'payments.create'])
    }));
    expect(menu).toContain('Orders');
    for (const label of ['Pets', 'Products', 'Services', 'Finance Records', 'Payroll']) expect(menu).not.toContain(label);
  });
});
