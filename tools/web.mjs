// Builds dist-web/: the files Cloudflare serves as static assets (the
// single-file game page and its icon). Run by `npm run build:web`.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
execFileSync(process.execPath, [join(root, 'tools/bundle.mjs')], { stdio: 'inherit' });
const out = join(root, 'dist-web');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(join(root, 'dist-single/dustiron.html'), join(out, 'index.html'));
copyFileSync(join(root, 'favicon.svg'), join(out, 'favicon.svg'));
console.log('dist-web ready');
