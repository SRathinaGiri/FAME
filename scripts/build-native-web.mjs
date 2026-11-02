// Builds the web app for a native shell.
//   node scripts/build-native-web.mjs android  -> www/            (Capacitor webDir)
//   node scripts/build-native-web.mjs desktop  -> desktop/app-www  + desktop/engine/engine.mjs
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
const outDirs = { android: 'www', desktop: join('desktop', 'app-www') };
if (!outDirs[target]) {
  console.error('Usage: node scripts/build-native-web.mjs <android|desktop>');
  process.exit(1);
}

execSync('npx vite build', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, FAME_NATIVE: target, FAME_OUT_DIR: outDirs[target] }
});

// Native shells never use the service worker or the PWA install manifest.
rmSync(join(root, outDirs[target], 'sw.js'), { force: true });

if (target === 'desktop') {
  // The Windows database worker runs the same engine in Node.
  const engineDir = join(root, 'desktop', 'engine');
  rmSync(engineDir, { recursive: true, force: true });
  mkdirSync(engineDir, { recursive: true });
  cpSync(join(root, 'src', 'engine.js'), join(engineDir, 'engine.mjs'));
}
console.log(`Built web app for ${target} into ${outDirs[target]}`);
