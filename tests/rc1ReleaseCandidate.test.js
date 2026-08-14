const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const routeFiles = fs.readdirSync(path.join(root, 'routes')).filter(file => file.endsWith('.js'));
const routePattern = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;

const declarations = file => {
  const text = source(`routes/${file}`);
  const rows = [];
  for (const match of text.matchAll(routePattern)) rows.push({ method: match[1].toUpperCase(), route: match[2], index: match.index });
  return rows;
};

const sameShapeMatch = (dynamicRoute, literalRoute) => {
  const dynamicSegments = dynamicRoute.split('/').filter(Boolean);
  const literalSegments = literalRoute.split('/').filter(Boolean);
  if (dynamicSegments.length !== literalSegments.length) return false;
  return dynamicSegments.every((segment, index) => segment.startsWith(':') || segment === literalSegments[index]);
};

test('all route files have unique method and path declarations', () => {
  assert.equal(routeFiles.length, 43);
  for (const file of routeFiles) {
    const seen = new Set();
    for (const entry of declarations(file)) {
      const key = `${entry.method} ${entry.route}`;
      assert.equal(seen.has(key), false, `duplicate ${key} in ${file}`);
      seen.add(key);
    }
  }
});

test('parameter routes do not shadow later same-method literal routes', () => {
  for (const file of routeFiles) {
    const rows = declarations(file);
    rows.forEach((entry, index) => {
      if (!entry.route.includes(':')) return;
      for (const later of rows.slice(index + 1)) {
        if (later.method !== entry.method || later.route.includes(':')) continue;
        assert.equal(sameShapeMatch(entry.route, later.route), false, `${entry.method} ${entry.route} shadows ${later.route} in ${file}`);
      }
    });
  }
});

test('API route mounts are unique and retain every protected domain', () => {
  const server = source('server.js');
  const mounts = [...server.matchAll(/app\.use\(['"](\/api\/[^'"]+)['"]/g)].map(match => match[1]);
  assert.equal(new Set(mounts).size, mounts.length);
  for (const domain of ['auth', 'users', 'bookings', 'orders', 'staff', 'stores', 'products', 'services', 'deliveries', 'logistics', 'payment', 'uploads']) {
    assert.ok(mounts.some(mount => mount === `/api/${domain}`), `missing /api/${domain}`);
  }
});

test('sensitive mutation routes retain authentication and permission middleware', () => {
  const checks = [
    ['routes/orders.js', /router\.patch\('\/:id\/status', authenticate, adminOrStaff, requirePermission/],
    ['routes/bookings.js', /router\.put\('\/:bookingId\/status', authenticate, requirePermission/],
    ['routes/products.js', /router\.post\('\/', authenticate, adminOrStaff, requirePermission/],
    ['routes/staff.js', /router\.use\(authenticate, adminOnly\)/],
    ['routes/stores.js', /router\.put\('\/my-store', authenticate, adminOnly/],
    ['routes/delivery.js', /router\.post\('\/generate', authenticate, requirePermission/]
  ];
  for (const [file, pattern] of checks) assert.match(source(file), pattern);
});

test('mechanical import cleanup leaves known active imports and removes confirmed unused ones', () => {
  assert.doesNotMatch(source('routes/chats.js'), /getAdminChats/);
  assert.doesNotMatch(source('controllers/productController.js'), /require\('mongoose'\)/);
  assert.doesNotMatch(source('controllers/staffController.js'), /require\('bcryptjs'\)/);
  assert.doesNotMatch(source('utils/emailValidator.js'), /promisify|dnsResolver/);
  assert.match(source('client/src/pages/admin/Dashboard.js'), /useRealTimeUpdates/);
  assert.match(source('client/src/contexts/AuthContext.js'), /refreshUserRole/);
});

test('README reflects the canonical roles and production payment architecture', () => {
  const readme = source('README.md');
  assert.match(readme, /^# Pawzzle/m);
  assert.match(readme, /super_admin.*platform_admin/);
  assert.match(readme, /admin.*store_owner/);
  assert.match(readme, /PayMongo-only/);
  assert.match(readme, /Node\.js \(v20 or higher\)/);
});

test('release security and business foundations remain connected', () => {
  assert.match(source('middleware/auth.js'), /attachStoreRolePolicy/);
  assert.match(source('config/permissions.js'), /explicit/i);
  assert.match(source('services/socketAuthorization.js'), /authenticateSocket/);
  assert.match(source('controllers/paymentController.js'), /paymongo/i);
  assert.match(source('controllers/uploadController.js'), /ownership|owner/i);
  assert.match(source('controllers/bookingController.js'), /proposal/i);
  assert.match(source('utils/refundPolicy.js'), /acknowledg/i);
});

test('defense documentation remains linked and release-ready', () => {
  assert.match(source('README.md'), /PHASE7_DEFENSE_READINESS\.md/);
  const defense = source('docs/PHASE7_DEFENSE_READINESS.md');
  for (const section of ['Feature completion checklist', 'User roles matrix', 'Remaining live verification items']) {
    assert.match(defense, new RegExp(section, 'i'));
  }
});
