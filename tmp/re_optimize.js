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

  // 1. Clear placeholders
  const placeholderRegex = /placeholder="[^"]*"/g;
  if (placeholderRegex.test(content)) {
    content = content.replace(placeholderRegex, 'placeholder=""');
    changed = true;
  }

  // 2. Reduce HUD sizing (Compact version)
  // Restore py-3.5
  if (content.includes('py-5')) {
    content = content.replace(/py-5/g, 'py-3.5');
    changed = true;
  }

  // Restore pl-28 (The version that fixed overlap/compactness)
  if (content.includes('pl-32')) {
    content = content.replace(/pl-32/g, 'pl-28');
    changed = true;
  }

  // Restore left-10
  if (content.includes('left-12')) {
    content = content.replace(/left-12/g, 'left-10');
    changed = true;
  }

  // Restore rounded-[1.5rem]
  if (content.includes('rounded-[2.5rem]')) {
    content = content.replace(/rounded-\[2\.5rem\]/g, 'rounded-[1.5rem]');
    changed = true;
  }

  // Restore rounded-2xl
  if (content.includes('rounded-3xl')) {
    content = content.replace(/rounded-3xl/g, 'rounded-2xl');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Re-optimized UI for ${file}`);
  }
});

// Now handle the StoreApplications modal compaction specifically
const saFile = 'client/src/pages/admin/StoreApplications.js';
let saContent = fs.readFileSync(saFile, 'utf8');

saContent = saContent.replace(
  /<div className="p-10 bg-white border-t border-slate-100 relative z-10 space-y-8 shadow-\[0_-20px_50px_rgba\(0,0,0,0\.05\)\]">/g,
  '<div className="p-6 bg-white border-t border-slate-100 relative z-10 space-y-4 shadow-[0_-20px_50px_rgba(0,0,0,0.05)]">'
);

saContent = saContent.replace(
  /<div className="bg-amber-50 rounded-\[2rem\] p-8 border border-amber-100\/50">/g,
  '<div className="bg-amber-50 rounded-2xl p-4 border border-amber-100/50">'
);

saContent = saContent.replace(
  /<h4 className="text-\[10px\] font-black uppercase text-amber-600 tracking-widest">Mark Corrections Needed<\/h4>/g,
  '<h4 className="text-[9px] font-black uppercase text-amber-600 tracking-widest">Mark Corrections Needed</h4>'
);

saContent = saContent.replace(
  /<div className="flex flex-wrap gap-2">/g,
  '<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-1.5">'
);

saContent = saContent.replace(
  /className={`px-3 py-1\.5 rounded-lg text-\[8px\]/g,
  'className={`px-2 py-1 rounded-lg text-[7px]'
);

saContent = saContent.replace(
  /className="py-6 bg-slate-900/g,
  'className="py-4 bg-slate-900'
);
saContent = saContent.replace(
  /className="py-6 bg-amber-500/g,
  'className="py-4 bg-amber-500'
);
saContent = saContent.replace(
  /className="py-6 bg-rose-600/g,
  'className="py-4 bg-rose-600'
);

saContent = saContent.replace(
  /<div className="bg-rose-50\/50 p-8 rounded-\[1\.5rem\] border border-rose-100\/50 mt-4">/g,
  '<div className="bg-rose-50/50 p-4 rounded-2xl border border-rose-100/50 mt-2">'
);

fs.writeFileSync(saFile, saContent, 'utf8');
console.log('Re-compacted Store Application review modal');
