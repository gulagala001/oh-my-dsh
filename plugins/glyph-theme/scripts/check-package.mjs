import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const report=JSON.parse(execFileSync('npm',['pack','--dry-run','--ignore-scripts','--json'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0];
const allowed=/^(?:src\/|lib\/|scripts\/check-package\.mjs$|package\.json$|cordis\.patch\.yml$|README(?:_EN)?\.md$|LICENSE$|THIRD_PARTY_NOTICES\.md$)/;
const bad=report.files.filter(f=>!allowed.test(f.path)||/(?:^|\/)(?:AGENTS|PLAN|CLAUDE|AI_README)\.md$|\.log$|(?:^|\/)(?:\.local|node_modules|data|test-results)(?:\/|$)/.test(f.path));
if(bad.length)throw Error('Unexpected distribution files: '+bad.map(f=>f.path).join(', '));
for(const file of ['lib/client.js','LICENSE','cordis.patch.yml','src/theme/theme.json'])if(!report.files.some(f=>f.path===file))throw Error('Missing '+file);
console.log(`Glyph distribution verified: ${report.files.length} files`);
