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

  // Restore ST: prefixes to all options that don't have them
  // Look for <option value="..." className="...">TEXT</option>
  const optionRegex = /<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g;
  content = content.replace(optionRegex, (match, val, text) => {
    if (text.startsWith('ST:')) return match;
    if (val === '') return match.replace(text, 'ST: ' + text.toUpperCase());
    return match.replace(text, 'ST: ' + text.toUpperCase());
  });

  // Specifically for StoreApplications, add Pending back
  if (file.includes('StoreApplications.js') && !content.includes('value="pending"')) {
     content = content.replace(
       /<option value="under_review"[^>]*>([^<]*)<\/option>/,
       '<option value="pending" className="bg-slate-900 text-white font-black">ST: PENDING</option>\n                 <option value="under_review" className="bg-slate-900 text-white font-black">ST: UNDER REVIEW</option>'
     );
  }

  fs.writeFileSync(file, content, 'utf8');
  console.log(`Fully restored ST: prefixes in ${file}`);
});
