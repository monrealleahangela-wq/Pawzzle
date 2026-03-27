const fs = require('fs');
const path = 'c:\\Users\\eugene pabello\\Desktop\\Pawzzle\\client\\src\\pages\\admin\\StoreApplications.js';
let content = fs.readFileSync(path, 'utf8');

// Restore the "Mark Corrections Needed" and "Decision Feedback" sections
content = content.replace(
  /<div className="p-6 bg-white border-t border-slate-100 relative z-10 space-y-4 shadow-\[0_-20px_50px_rgba\(0,0,0,0\.05\)\]">/g,
  '<div className="p-10 bg-white border-t border-slate-100 relative z-10 space-y-8 shadow-[0_-20px_50px_rgba(0,0,0,0.05)]">'
);

content = content.replace(
  /<div className="bg-amber-50 rounded-2xl p-4 border border-amber-100\/50">/g,
  '<div className="bg-amber-50 rounded-[2rem] p-8 border border-amber-100/50">'
);

content = content.replace(
  /<h4 className="text-\[9px\] font-black uppercase text-amber-600 tracking-widest">Mark Corrections Needed<\/h4>/g,
  '<h4 className="text-[10px] font-black uppercase text-amber-600 tracking-widest">Mark Corrections Needed</h4>'
);

content = content.replace(
  /<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-1\.5">/g,
  '<div className="flex flex-wrap gap-2">'
);

content = content.replace(
  /className={`px-2 py-1 rounded-lg text-\[7px\]/g,
  'className={`px-3 py-1.5 rounded-lg text-[8px]'
);

content = content.replace(
  /className="py-4 bg-slate-900/g,
  'className="py-6 bg-slate-900'
);
content = content.replace(
  /className="py-4 bg-amber-500/g,
  'className="py-6 bg-amber-500'
);
content = content.replace(
  /className="py-4 bg-rose-600/g,
  'className="py-6 bg-rose-600'
);

content = content.replace(
  /<div className="bg-rose-50\/50 p-4 rounded-3xl border border-rose-100\/50 mt-2">/g,
  '<div className="bg-rose-50/50 p-8 rounded-[1.5rem] border border-rose-100/50 mt-4">'
);

fs.writeFileSync(path, content, 'utf8');
console.log('Restored Review Application modal to full size');
