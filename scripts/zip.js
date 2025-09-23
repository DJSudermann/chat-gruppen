// scripts/zip.js
const fs = require('fs');
const cp = require('child_process');
const pkg = require('../package.json');

fs.mkdirSync('releases', { recursive: true });

let sha = 'local';
try {
  sha = cp.execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString().trim();
} catch {}

const out = `releases/chat-gruppen-v${pkg.version}-${sha}.zip`;

// Zippe die **Inhalte** von dist ins Root des Archivs (index.html oben im ZIP)
const cmd = `npx --yes bestzip ${JSON.stringify(out)} dist/*`;
cp.execSync(cmd, { stdio: 'inherit', shell: true });
