import fs from 'fs';
import path from 'path';

const collectJavaScript = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  if (entry.name === 'build' || entry.name.endsWith('.test.js')) return [];
  const fullPath = path.join(directory, entry.name);
  if (entry.isDirectory()) return collectJavaScript(fullPath);
  return /\.(js|jsx)$/.test(entry.name) ? [fullPath] : [];
});

test('application screens do not use browser-native popup dialogs', () => {
  const sourceRoot = path.resolve(process.cwd(), 'src');
  const violations = collectJavaScript(sourceRoot).flatMap(file => {
    const source = fs.readFileSync(file, 'utf8');
    const usesWindowDialog = /\bwindow\.(?:alert|confirm|prompt)\s*\(/.test(source);
    const usesBareAlertOrPrompt = /(^|[^.\w])(?:alert|prompt)\s*\(/m.test(source);
    return usesWindowDialog || usesBareAlertOrPrompt ? [path.relative(sourceRoot, file)] : [];
  });

  expect(violations).toEqual([]);
});
