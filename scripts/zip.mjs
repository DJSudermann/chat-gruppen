// scripts/zip.mjs  (ESM)
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import bestzip from 'bestzip';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

let sha = 'local';
try {
  sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {}

mkdirSync('releases', { recursive: true });

const out = resolve(`releases/chat-gruppen-v${pkg.version}.zip`);

// WICHTIG: cwd:'dist' + source:'*' → Inhalte von dist direkt ins ZIP-Root
await bestzip({
  source: ['*'],          // NICHT 'dist/*'
  destination: out,
  cwd: 'dist',            // Hierdurch liegen index.html & assets im ZIP-Root
});

console.log('ZIP erstellt:', out);
