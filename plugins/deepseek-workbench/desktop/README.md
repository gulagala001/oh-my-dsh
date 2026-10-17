# DeepSeek workbench desktop adapter

This directory contains an opt-in DSH desktop source patch. A client plugin cannot create persistent Electron sessions or override the shell's download policy. Until a desktop host is built and distributed with this capability, the plugin must show the capability as unavailable and offer the system-browser entry point. This patch does not modify an installed or signed application.

For current rc.2/alpha.3/rc.1 sources, run `node desktop/apply-host.mjs /absolute/owned/dsh-source` after applying the matching current OpenCU adapter. It rejects installed apps, source-cache paths, mismatched frameworks and non-unique anchors; it preserves CU asynchronous release and adds only the opt-in Workbench profile. The rc.1 compiler input is Electron `44.7.0`; build the guest/preload with matching inputs. The fixed alpha.2 generator below is retained for that source version only.

The generator and reviewable patch target the actual public DSH `0.2.1-alpha.2` source at commit `d743267388641bc76f17c45ce8b4c231aed1d32c`, not an alpha.1 tree with renamed peers. The patch modifies seven existing TypeScript paths, adds the policy TypeScript file and adds that real dependency to the original root Client aggregate's include list without changing the other configuration. The source archive SHA-256 is `414db357dda081d11d531ea3e9969f48fa0502809ff579396c3c2bbf7e109253`; the lockfile SHA-256 is `b45f8695fb0dca90d3ed07afc766e923356539962706ee36ac8cdb396e6d734d`. The actual root/desktop/CLI manifests declare alpha.2; the lock pins Electron `44.7.0`, TypeScript `6.0.3` and pnpm `11.28.5`. [source-baseline.mjs](./source-baseline.mjs) records their actual input hashes and the reviewed output hashes. No installed or running DSH was modified. The downloaded source remains immutable. Patch paths are relative to the DSH repository root.

The account UI uses the existing `window.dshPlatform` view, which obtains Platform authorization from the DSH account lifetime without exposing credentials to the plugin. The patch adds an explicit `api-keys` page alongside usage/top-up. This is Platform-only authorization: the official chat website has a separate login protocol and no supported DSH-grant exchange was found. Its web session still requires one separate sign-in.

The front-end interface is:

```ts
const bridge = window.dshDesktop.browser
const support = await bridge.capabilities?.()
if (support?.persistentProfiles && support.downloads) {
  const reservation = await bridge.acquire(workspace, { profile: 'deepseek-workbench' })
  // Mount about:blank#<lease> using the approved partition before navigating.
  bridge.onOpenRequested(reservation.lease, (url, request) => {
    // Acquire the next guest with request.profile to preserve its product policy.
  })
  // Release the guest when its owner is disposed.
  await bridge.release(reservation.lease)
}
```

The profile uses application-wide `persist:dsh-deepseek-workbench-v1` storage, shared by chat and API-platform tabs across workspaces and restarts. Chromium owns cookies and web storage in the host's user-data directory. Releasing a guest does not erase login data. The patch does not extract credentials, synchronize cookies or provide a logout-all control; the official pages retain their sign-out controls. Ordinary Sidebar guests keep their existing workspace-scoped, process-only partitions and download denial.

Top-level pages and popup targets are restricted to `https://chat.deepseek.com` and `https://platform.deepseek.com`, including their sign-in paths. Product network resources permit HTTPS/WSS on `deepseek.com` and its subdomains. HTTPS subresources also permit the official page's captcha SDKs: Cloudflare's exact challenge origin, hCaptcha's own site and rotating asset subdomains, the observed Shumei CN/SG static/tracker/captcha endpoints, and the page-specific AWS WAF SDK origins and captcha asset site. Apple support permits only `appleid.cdn-apple.com/appleauth/static/` SDK resources; its external login page/popup is blocked and Apple account authentication is not claimed as supported. Credentials in URLs, custom ports, local application host requests, filesystem schemes and site lookalikes remain blocked. New origins need a reviewed policy update and native verification. Web security, sandbox, context isolation, denied device permissions and disabled Node integration remain enforced.

The resource fixtures follow the official [DeepSeek page script](https://fe-static.deepseek.com/chat/static/main.8d6a4f4bfa.js) and the publicly served provider SDKs. [hCaptcha's developer guide](https://docs.hcaptcha.com/) requires allowing its changing asset subdomains; [Cloudflare's CSP guide](https://developers.cloudflare.com/turnstile/reference/content-security-policy/) identifies the challenge origin. Shumei dependencies are read from its [CN SDK](https://castatic.fengkongcloud.cn/pr/v1.0.4/smcp.min.js) and [SG SDK](https://castatic-xjp.fengkongcloud.cn/pr/v1.0.4/smcp.min.js). The observed official [AWS SDK](https://a0fea896111e.edge.captcha-sdk.awswaf.com/a0fea896111e/jsapi.js) identifies the account-specific companion SDK and regional captcha asset site. These exceptions permit required web resources; they do not permit provider top-level navigation or provider downloads, and do not bypass challenges.

An `<input type="file">` upload uses Chromium's manual file picker; the patch adds no automation or path grant. Downloads require a live attached profile lease, an official current page, an official Chromium initiator origin and an entirely approved redirect chain. DeepSeek HTTPS resources, the official script's exact `https://files.deepseeksvc.com` file-service host and official-origin blob exports are allowed; arbitrary `deepseeksvc.com` subdomains are not. The native save dialog receives a sanitized portable default filename and an overwrite confirmation; the patch never sets an automatic save path. Releasing the lease or destroying its guest cancels its active download items. Standard guest downloads, unowned guests and nonofficial initiators remain denied.

Cross-origin attachment links and popup requests to the exact file-service `/api/` route are intercepted on an official current page and downloaded without changing the guest document. Main-issued requests carry a lease-local approval for the exact canonical URL, consumed once at `will-download`, expiring after 30 seconds and capped at 32 pending requests per lease. Only a matching unexpired approval can supply the initiating official origin when Electron reports an empty initiator for a main-issued download; all other empty initiators stay denied. Closing the lease clears its approvals. Redirects are still checked individually and downloaded content never becomes a top-level file-service page.

[deepseek-browser-policy.ts](./deepseek-browser-policy.ts) is the source used by the host patch; [deepseek-browser-policy.mjs](./deepseek-browser-policy.mjs) is its reusable JavaScript policy. The policy has not been relaxed. [build-host-patch.mjs](./build-host-patch.mjs) regenerates both outputs only from the pinned, pristine alpha.2 inputs, requires each replacement to match once, and compares every patched file and the complete diff against the exact reviewed hashes. It keeps `HOST_PATHS` as the seven existing TypeScript paths, handles root Client JSON separately and emits its diff after the new policy file, matching the reviewed patch order. It uses owned temporary copies and does not modify the supplied source. The complete patch SHA-256 is `0d2519d3e7ac8c5d47fde304fbffa5dbf3d00dadd41e93e02ac651c8427eebf9`; the patched root Client config SHA-256 is `8eae954d8d0e49bb7039bce204f5afc14ffb1f486a2096a81115fa0e4d6de223`.


## Build and installation

Use the exact DSH 0.2.1-rc.1 or 0.2.1-rc.2 source tree for the selected plugin release. Apply the matching OpenCU adapter first, then run `node desktop/apply-host.mjs /absolute/owned/dsh-source`. Install the exact SDK/framework and extension-host dependencies, rebuild Host, Client, Web, desktop main and all affected preloads, then package/sign through the upstream platform workflow. Fixed downloads and source adapter archives: [current releases](../../../docs/releases.md).
