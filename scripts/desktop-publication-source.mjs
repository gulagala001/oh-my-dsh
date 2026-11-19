// OMD's signed build, approval summary, upload and cache purge share the selected deployment origin.
const productionEnvironment = [
  "DSH_DESKTOP_AUTO_UPDATE_ENV: 'production', DOWNLOAD_PROD_COS_BUCKET: config.bucket",
  "DSH_DESKTOP_AUTO_UPDATE_ENV: 'production', DOWNLOAD_PROD_ORIGIN: config.origin, DOWNLOAD_PROD_COS_BUCKET: config.bucket",
];
const websiteApproval = ['websiteApproval(manifest, config.bucket)', 'websiteApproval(manifest, config.bucket, config.origin)'];
export const publicationChanges = [
  ['apps/desktop/scripts/desktop-auto-update-environment.mjs', [
    ["    originEnvName: undefined,\n    fixedOrigin: 'https://download.deepseek.com',", "    originEnvName: 'DOWNLOAD_PROD_ORIGIN',\n    fixedOrigin: undefined,"],
    ['export function desktopWebsiteInstallerUrl(target) {\n  return `${UPDATE_ENVIRONMENTS.production.fixedOrigin}/desktop/${desktopLatestInstallerFilename(target)}`',
      "export function desktopWebsiteInstallerUrl(target, origin) {\n  return `${httpsOrigin(origin, 'production origin')}/desktop/${desktopLatestInstallerFilename(target)}`"],
    ['return `dsh-latest-', 'return `omd-latest-'],
    ["let releasePrefix = 'dsh-desk'", "let releasePrefix = 'omd-desk'"],
  ]],
  ['apps/desktop/scripts/desktop-auto-update-environment.d.mts', [
    ['desktopWebsiteInstallerUrl(target: DesktopAutoUpdateTarget)', 'desktopWebsiteInstallerUrl(target: DesktopAutoUpdateTarget, origin: string)'],
  ]],
  ['apps/desktop/scripts/desktop-publish-config.ts', [
    ["(config.origin !== 'https://download.deepseek.com' || !config.githubApp)", '!config.githubApp'],
    ['requires its fixed origin and GitHub App configuration', 'requires GitHub App configuration'],
  ]],
  ['apps/desktop/scripts/publish-desktop-ci.ts', [productionEnvironment, websiteApproval]],
  ['apps/desktop/scripts/publish-desktop-rollout-ci.ts', [productionEnvironment, websiteApproval,
    ['desktopWebsiteInstallerUrl(route.target)', 'desktopWebsiteInstallerUrl(route.target, config.origin)']]],
  ['apps/desktop/scripts/desktop-publication-summary.ts', [
    ['desktopWebsiteInstallerUrl(plan.target)', 'desktopWebsiteInstallerUrl(plan.target, origin)'],
  ]],
  ['apps/desktop/scripts/desktop-website-installer.ts', [
    ['route: DesktopPublishRoute, repository: string, bucket: string)', 'route: DesktopPublishRoute, repository: string, bucket: string, origin: string)'],
    ['desktopWebsiteInstallerUrl(route.target)', 'desktopWebsiteInstallerUrl(route.target, origin)'],
  ]],
  ['apps/desktop/scripts/publish-website-ci.ts', [
    websiteApproval,
    ['websiteApproval(manifest: unknown, bucket: string)', 'websiteApproval(manifest: unknown, bucket: string, origin: string)'],
    ['JSON.stringify({ manifest, bucket })', 'JSON.stringify({ manifest, bucket, origin })'],
    ["env.GITHUB_REPOSITORY || '', config.bucket)", "env.GITHUB_REPOSITORY || '', config.bucket, config.origin)"],
    ['desktopWebsiteInstallerUrl(route.target)', 'desktopWebsiteInstallerUrl(route.target, config.origin)'],
  ]],
];
