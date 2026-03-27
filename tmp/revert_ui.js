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

  // Restore py-5 (spacious height)
  if (content.includes('py-3.5')) {
    content = content.replace(/py-3\.5/g, 'py-5');
    changed = true;
  }

  // Restore pl-32 (standard padding that eliminates overlap 100%)
  if (content.includes('pl-28') || content.includes('pl-14') || content.includes('pl-20')) {
    content = content.replace(/pl-[0-9]{2}/g, 'pl-32');
    changed = true;
  }

  // Restore left-12 (standard icon offset)
  if (content.includes('left-10') || content.includes('left-8') || content.includes('left-5')) {
    content = content.replace(/left-[0-9]{2}/g, 'left-12');
    content = content.replace(/left-8/g, 'left-12');
    content = content.replace(/left-5/g, 'left-12');
    changed = true;
  }

  // Restore rounded-[2.5rem]
  if (content.includes('rounded-[1.5rem]')) {
    content = content.replace(/rounded-\[1\.5rem\]/g, 'rounded-[2.5rem]');
    changed = true;
  }

  // Restore rounded-3xl
  if (content.includes('rounded-2xl')) {
    content = content.replace(/rounded-2xl/g, 'rounded-3xl');
    changed = true;
  }

  // Restore placeholders based on file name if possible
  if (content.includes('placeholder=""')) {
    const filename = path.basename(file, '.js');
    let queryText = 'QUERY ...';
    if (filename === 'AccountManagement') queryText = 'QUERY ACCOUNTS...';
    if (filename === 'StoreApplications') queryText = 'QUERY APPLICATIONS...';
    if (filename === 'ActivityHistory') queryText = 'QUERY ACTIVITY...';
    if (filename === 'TransactionHistory') queryText = 'QUERY TRANSACTIONS...';
    if (filename === 'ReportManagement') queryText = 'QUERY REPORTS...';
    if (filename === 'SupportManagement') queryText = 'QUERY MESSAGES...';
    if (filename === 'FeedbackManagement') queryText = 'QUERY FEEDBACK...';
    if (filename === 'ArchiveManagement') queryText = 'QUERY ARCHIVES...';
    if (filename === 'BookingManagement') queryText = 'QUERY BOOKINGS...';
    if (filename === 'Orders') queryText = 'QUERY ORDERS...';

    content = content.replace(/placeholder=""/g, `placeholder="${queryText}"`);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Reverted UI changes in ${file}`);
  }
});
