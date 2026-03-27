const fs = require('fs');
const path = require('path');

const superAdminDir = 'client/src/pages/superadmin';
const specificFiles = [
  'client/src/pages/admin/StoreApplications.js',
  'client/src/pages/admin/BookingsManagement.js',
  'client/src/pages/admin/Orders.js'
];

let files = [];
try {
  files = fs.readdirSync(superAdminDir).map(file => path.join(superAdminDir, file));
} catch (e) {
  console.error('SuperAdmin directory not found');
}
files = [...files, ...specificFiles];

files.forEach(file => {
  if (fs.statSync(file).isDirectory()) return;
  if (!file.endsWith('.js')) return;

  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  if (content.includes('py-5')) {
    content = content.split('py-5').join('py-3.5');
    changed = true;
  }

  if (content.includes('pl-32')) {
    content = content.split('pl-32').join('pl-20');
    changed = true;
  }

  if (content.includes('left-12')) {
    content = content.split('left-12').join('left-8');
    changed = true;
  }

  if (content.includes('rounded-[2.5rem]')) {
    content = content.split('rounded-[2.5rem]').join('rounded-[1.5rem]');
    changed = true;
  }

  if (content.includes('rounded-3xl')) {
    content = content.split('rounded-3xl').join('rounded-2xl');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Optimized UI sizing for ${file}`);
  }
});
