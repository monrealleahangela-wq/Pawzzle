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

  const placeholderRegex = /placeholder="[^"]*"/g;
  if (placeholderRegex.test(content)) {
    content = content.replace(placeholderRegex, 'placeholder=""');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Cleared placeholders in ${file}`);
  }
});
