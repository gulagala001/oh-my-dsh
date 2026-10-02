import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { hostAlignedVersion, parseVersion } from '../src/version.mjs';

const { values, positionals } = parseArgs({ options: { omd: { type: 'string' } }, allowPositionals: true });
if (positionals.length !== 1) throw Error('Usage: node scripts/dsh-release-plan.mjs <host version> [--omd <major.feature.patch>]');
const hostVersion = positionals[0].replace(/^v/, '');
parseVersion(hostVersion);
const pluginVersion = hostAlignedVersion(hostVersion, values.omd);
const json = path => readFile(new URL('../' + path, import.meta.url), 'utf8').then(JSON.parse);
const [own, opencu, conversation, chat, desktop] = await Promise.all([
  json('package.json'), json('vendor/opencu/package.json'), json('vendor/dsh.json'),
  json('vendor/opencu/vendor/dsh-chat.json'), json('scripts/desktop-releases.json'),
]);
const changes = (pkg, source) => Object.entries(pkg).flatMap(([section, fields]) => ['dependencies', 'devDependencies', 'peerDependencies'].includes(section)
  ? Object.entries(fields).filter(([name, version]) => (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) && version !== hostVersion)
    .map(([name, version]) => ({ source, section, name, from: version, to: hostVersion })) : []);
const sourceSnapshots = [['vendor/dsh.json', conversation], ['OpenCU vendor/dsh-chat.json', chat]].map(([source, manifest]) => ({
  source, commit: manifest.commit, version: manifest.version, tag: manifest.tag,
  matchesRequestedRelease: manifest.version === hostVersion && manifest.tag === 'dsh-v' + hostVersion,
}));
console.log(JSON.stringify({
  hostVersion, pluginVersion, currentPluginVersion: own.version,
  sdkChanges: [...changes(own, 'package.json'), ...changes(opencu, 'OpenCU package.json')],
  sourceSnapshots,
  desktopTargets: ['mac-arm64', 'win-x64'].map(target => ({ target, verifiedMetadataPresent: Boolean(desktop.releases?.[hostVersion]?.[target]) })),
  releaseFiles: ['package.json', 'pnpm-lock.yaml', 'release-manifest.json', 'README.md', 'CHANGELOG.md', 'docs/upgrade.md', 'docs/usage.md', 'scripts/desktop-releases.json'],
  instructions: 'Use the final official tag and desktop update feeds, resync both source snapshots, rebuild OpenCU and OMD, then run the release verification described in docs/dsh-0.2-preparation.md.',
}, null, 2));
