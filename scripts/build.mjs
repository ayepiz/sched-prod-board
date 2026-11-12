// R6: copy app/ to dist/ and stamp the git sha into <meta name="build"> and the footer.
import { execSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';

const dirty = execSync('git status --porcelain -- app scripts').toString().trim();
if (dirty && !process.argv.includes('--allow-dirty')) {
  console.error('Refusing to build: uncommitted changes in app/ or scripts/, so the sha would lie.\n' + dirty);
  process.exit(1);
}
const sha = execSync('git rev-parse HEAD').toString().trim();
rmSync('dist', { recursive: true, force: true });
cpSync('app', 'dist', { recursive: true });
const html = readFileSync('dist/index.html', 'utf8').replaceAll('__BUILD_SHA__', sha);
writeFileSync('dist/index.html', html);
console.log(`built dist/ at ${sha}`);
