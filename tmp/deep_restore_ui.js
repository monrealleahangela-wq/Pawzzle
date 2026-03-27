const fs = require('fs');
const path = require('path');

const directories = [
  'client/src/pages/superadmin',
  'client/src/pages/admin'
];

let files = [];
directories.forEach(dir => {
  try {
    const dFiles = fs.readdirSync(dir)
      .filter(file => file.endsWith('.js'))
      .map(file => path.join(dir, file));
    files = [...files, ...dFiles];
  } catch (e) {
    console.error(`Directory not found: ${dir}`);
  }
});

files.forEach(file => {
  if (fs.statSync(file).isDirectory()) return;

  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // 1. Restore/Standardize Wide HUD Sizing (pl-32, left-12, py-5, rounded-[2.5rem])
  // Look for patterns like pl-20, pl-28, pl-16, pl-14, pl-12
  const paddingRegex = /pl-(12|14|16|20|24|28)/g;
  if (paddingRegex.test(content)) {
    content = content.replace(paddingRegex, 'pl-32');
    changed = true;
  }

  const iconLeftRegex = /left-(5|6|8|10)/g;
  if (iconLeftRegex.test(content)) {
    content = content.replace(iconLeftRegex, 'left-12');
    changed = true;
  }

  // Ensure py-5
  if (content.includes('py-3.5') || content.includes('py-4') || content.includes('py-[1.125rem]')) {
    content = content.replace(/py-(3\.5|4|\[1\.125rem\])/g, 'py-5');
    changed = true;
  }

  // Ensure rounded-[2.5rem] for the HUD container
  if (content.includes('rounded-[1.5rem]') || content.includes('rounded-3xl')) {
    // Only if it's likely a HUD container (has 'bg-slate-900')
    if (content.includes('bg-slate-900')) {
      content = content.replace(/rounded-\[1\.5rem\]/g, 'rounded-[2.5rem]');
      content = content.replace(/rounded-3xl/g, 'rounded-[2.5rem]');
      changed = true;
    }
  }

  // Ensure rounded-3xl for the inputs/selects inside
  if (content.includes('rounded-2xl')) {
    content = content.replace(/rounded-2xl/g, 'rounded-3xl');
    changed = true;
  }

  // 2. Restore ST: Prefixes
  const optionRegex = /<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g;
  if (optionRegex.test(content)) {
    content = content.replace(optionRegex, (match, val, text) => {
      if (text.trim().startsWith('ST:')) return match;
      if (text.trim() === '') return match;
      return match.replace(text, 'ST: ' + text.trim().toUpperCase());
    });
    changed = true;
  }

  // 3. Restore Placeholders
  const inputPlaceholderRegex = /placeholder=""/g;
  if (inputPlaceholderRegex.test(content)) {
    const filename = path.basename(file, '.js').toUpperCase().replace('MANAGEMENT', '').replace('HISTORY', '');
    content = content.replace(/placeholder=""/g, `placeholder="QUERY ${filename}..."`);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Deep restored Super Admin UI standard in ${file}`);
  }
});
