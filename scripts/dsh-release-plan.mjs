import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { hostAlignedVersion, parseVersion } from '../src/version.mjs';

const { values, positionals } = parseArgs({ options: { omd: { type: 'string' } }, allowPositionals: true });
if (positionals.length !== 1) throw Error('Usage: node scripts/dsh-release-plan.mjs <host version> [--omd <major.feature.patch[-prerelease]>]');
const hostVersion = positionals[0].replace(/^v/, '');
parseVersion(hostVersion);
const json = path => readFile(new URL('../' + path, import.meta.url), 'utf8').then(JSON.parse);
const [own, opencu, conversation, chat, distribution, desktop] = await Promise.all([
  json('package.json'), json('vendor/opencu/package.json'), json('vendor/dsh.json'),
  json('vendor/dsh/ui-chat.json'), json('vendor/opencu.json'), json('scripts/desktop-releases.json'),
]);
// Keep an unpublished OMD prerelease suffix even before the shared version helper supports it.
const omdVersion = values.omd ?? own.version.split('.omd.')[1] ?? own.version.split('-omd.')[1];
parseVersion(omdVersion);
if (omdVersion.includes('+')) throw Error('OMD version must not contain build metadata');
const [alignedVersion, build] = hostAlignedVersion(hostVersion, omdVersion.split('-')[0]).split('+');
const pluginVersion = alignedVersion + (omdVersion.includes('-') ? '-' + omdVersion.split('-').slice(1).join('-') : '') + (build ? '+' + build : '');
const changes = (pkg, source) => Object.entries(pkg).flatMap(([section, fields]) => ['dependencies', 'devDependencies', 'peerDependencies'].includes(section)
  ? Object.entries(fields).filter(([name, version]) => (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) && version !== hostVersion)
    .map(([name, version]) => ({ source, section, name, from: version, to: hostVersion })) : []);
const snapshot = (source, manifest) => ({
  source, repository: manifest.repository, commit: manifest.commit, version: manifest.version, tag: manifest.tag,
  matchesRequestedRelease: manifest.version === hostVersion && manifest.tag === 'dsh-v' + hostVersion,
});
const sourceSnapshots = [['vendor/dsh.json', conversation], ['vendor/dsh/ui-chat.json', chat]].map(([source, manifest]) => snapshot(source, manifest));
console.log(JSON.stringify({
  hostVersion, pluginVersion, currentPluginVersion: own.version,
  releaseStatus: 'unpublished', publicationAuthorized: false,
  sdkChanges: changes(own, 'package.json'),
  sourceSnapshots,
  sourceSnapshotsAligned: ['repository', 'version', 'tag', 'commit'].every(field => conversation[field] === chat[field]),
  bundledOpenCU: {
    version: opencu.version, policy: 'rewritten-plugin', sdkChanges: changes(opencu, 'vendor/opencu/package.json'),
    distributionSnapshot: { source: 'vendor/opencu.json', repository: distribution.repository, commit: distribution.commit,
      version: distribution.version, archiveSha256: distribution.archiveSha256, workingTree: distribution.workingTree },
    distributionIdentityAligned: distribution.version === opencu.version,
    sdkVersions: Object.fromEntries(['dependencies', 'devDependencies', 'peerDependencies'].map(section => [section,
      Object.fromEntries(Object.entries(opencu[section] ?? {}).filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')))])),
    instructions: 'Build the rewritten OpenCU plugin and sync its complete distributable. Match its SDK to the target DSH; verify standalone, bundled and co-installed ownership in isolation. OMD owns the separate matching public Chat snapshot.',
  },
  desktopTargets: ['mac-arm64', 'win-x64'].map(target => ({ target, verifiedMetadataPresent: Boolean(desktop.releases?.[hostVersion]?.[target]) })),
  releaseFiles: ['package.json', 'pnpm-lock.yaml', 'vendor/dsh.json', 'vendor/dsh/ui-chat.json', 'release-manifest.json', 'README.md', 'README_EN.md', 'CHANGELOG.md', 'docs/upgrade.md', 'docs/usage.md', 'scripts/desktop-releases.json'],
  instructions: 'Use the final official tag and desktop update feeds, align OMD DSH packages plus the official Cordis and Schemastery versions, and sync the OMD-owned Conversation and Chat snapshots from the exact host commit in a writable staging source. Follow Build Responsibilities and Tests on Demand in docs/development_EN.md and the release guidance in CONTRIBUTING.md. Complete all implementation before the centralized build, tests, packaging and isolated host acceptance. Keep this candidate unpublished; public submission, push and release require separate authorization.',
}, null, 2));
