const fs = require('fs');
const path = require('path');

const targets = [
  'test-bcrypt.js', 
  'test-staff-creation.js', 
  'debug-staff-password.js', 
  'patchprofile.js', 
  'patch.js', 
  'updateprofile.js', 
  'updatepass.js', 
  'compact_review.js', 
  'bulkf_fix_hud.js', 
  'fix_titlecase.js', 
  'fix_filters.js', 
  'test-db.js'
];

function find(dir) {
  const results = [];
  try {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) {
         if (file !== 'node_modules' && file !== '.git') {
            results.push(...find(full));
         }
      } else if (targets.includes(file)) {
         results.push(full);
      }
    });
  } catch (e) {}
  return results;
}

console.log('SEARCH_RESULTS:');
find('.').forEach(r => console.log(r));
