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
  files = fs.readdirSync(superAdminDir)
    .filter(file => file.endsWith('.js'))
    .map(file => path.join(superAdminDir, file));
} catch (e) {
  console.error('SuperAdmin directory not found');
}
files = [...files, ...specificFiles];

files.forEach(file => {
  if (fs.statSync(file).isDirectory()) return;

  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  if (content.includes('pl-14')) {
    content = content.replace(/pl-14/g, 'pl-20');
    changed = true;
  }
  if (content.includes('left-5')) {
    content = content.replace(/left-5/g, 'left-8');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Alignment fix (pl-20) for ${file}`);
  }
});
