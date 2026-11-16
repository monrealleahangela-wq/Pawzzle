import fs from 'fs';
import path from 'path';

const publicRoot = path.resolve(process.cwd(), 'public');
const sourceRoot = path.resolve(process.cwd(), 'src');
const repositoryRoot = path.resolve(process.cwd(), '..');

const pngDimensions = filePath => {
  const image = fs.readFileSync(filePath);
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
};

test('manifest and real icon dimensions meet shared-link PWA install requirements', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(publicRoot, 'manifest.json'), 'utf8'));
  expect(manifest).toEqual(expect.objectContaining({
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    prefer_related_applications: false
  }));

  const icons = Object.fromEntries(manifest.icons.map(icon => [icon.sizes, icon]));
  expect(icons['192x192']).toBeDefined();
  expect(icons['512x512']).toBeDefined();
  expect(pngDimensions(path.join(publicRoot, icons['192x192'].src))).toEqual({ width: 192, height: 192 });
  expect(pngDimensions(path.join(publicRoot, icons['512x512'].src))).toEqual({ width: 512, height: 512 });
});

test('service worker is valid, update-safe, and registered before the landing install action', () => {
  const worker = fs.readFileSync(path.join(publicRoot, 'sw.js'), 'utf8');
  const entry = fs.readFileSync(path.join(sourceRoot, 'index.js'), 'utf8');
  const landing = fs.readFileSync(path.join(sourceRoot, 'pages/public/Landing.js'), 'utf8');
  const server = fs.readFileSync(path.join(repositoryRoot, 'server.js'), 'utf8');

  expect(worker).not.toMatch(/\bBroadway\b/);
  expect(worker).toMatch(/self\.skipWaiting\(\)/);
  expect(worker).toMatch(/self\.clients\.claim\(\)/);
  expect(worker).toMatch(/request\.mode === 'navigate'/);
  expect(entry.indexOf('initializePwaInstall();')).toBeLessThan(entry.indexOf('createRoot'));
  expect(entry).toMatch(/registerPwaServiceWorker\(\)/);
  expect(landing).toMatch(/<PwaInstallSection\s*\/>/);
  expect(server).toMatch(/app\.get\('\/sw\.js'/);
  expect(server).toMatch(/'Cache-Control': 'no-cache, no-store, must-revalidate'/);
  expect(server).toMatch(/'Service-Worker-Allowed': '\/'/);
});
