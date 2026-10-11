# Using Other Plugins with OMD

[简体中文](plugin-compatibility.md) · [Documentation](README_EN.md) · [Installation](upgrade_EN.md) · [Recommended plugins](usage_EN.md#recommended-plugins) · [Adaptation requests (Chinese)](plugin-submissions.md)

Check complete DSH, OMD, and third-party plugin versions first. Passing installation checks does not establish account workflows, interface behavior, and every lifecycle step.

OMD uses native management, tools, skills, and scopes. Compatibility improvements retain functionality rather than bypassing checks or disabling enhancements to claim coexistence.

## Public Pairs and Development Status

| Status | Scope |
| --- | --- |
| Public `0.2.0-rc.2.omd.0.10.0` | DSH `0.2.0-rc.2`. |
| Public `0.2.1-alpha.1.omd.0.10.0` | DSH `0.2.1-alpha.1`. |
| GitHub `main` `0.2.1-alpha.2.omd.0.16.0` | Unpublished alpha.2 development, including the OpenCU 1.6.1 browser and runtime reconstruction. |
| Latest local OpenCU `1.6.1` reconstruction | Browser/runtime changes are integrated into main; local and public packages still require content and host checks. |

Coverage evolves with hosts and actual verification, rather than a permanent allowlist. A historical artifact does not establish new-host compatibility.

## Install and Update Other Plugins

1. Check purpose, author, fixed source, host, and status in Recommended plugins. Unpublished entries or missing checksums may be unavailable.
2. Install natively in the current profile. Desktop uses the app or its bundled CLI.
3. Fully restart, open the plugin's entry, and check tools, skills, or settings.
4. Verify account workflows separately. Installation/enabling does not establish quotas, OAuth, or paid requests.

Automatic updates default off, apply only to installed/enabled verified releases, and do not cross host builds automatically. Check SDKs and fixed builds for all plugins before upgrading. Do not relax peers or copy another host's dependencies.

<a id="opencu"></a>

## Standalone OpenCU and OMD Integration

OMD includes OpenCU already. If you only need computer operation, [install OpenCU independently](https://github.com/gulagala001/opencu); OMD is not required.

The latest local implementation was checked in both loading orders with standalone OpenCU. This result belongs to that actual pairing, not arbitrary versions, and does not mean the GitHub OMD snapshot includes the latest fix. Use release-specific documentation for public combinations.

## Common Plugin Boundaries

| Plugin | Check before use |
| --- | --- |
| OMAA | Independent presets; base behavior and optional enhancements have separate availability. Changing hosts needs matching builds. |
| Subscriptions | Fixed OMD-adapted package; accounts, Fast, quotas, and paid workflows need separate checks. |
| Intelligent UI | Optional; explicit submission continues the conversation. Fixed release/checksum must exist before installation. |
| OpenDesign | Prepare its own skills/design tools. OMD does not replace account requirements. |
| Turn Rewind `0.3.9` | Native alpha.1 refuses it; rc.2 accepts it. Do not bypass the gate. |
| Status Rotator and other standard packages | Full source/version, actual interface, enable/disable/removal behavior. |
| Blender and development-injection projects | Follow their connection/injection instructions if not standard packages. |

Use current directory records and independent release notes. One coexistence run does not cover every version/platform.

## What Coexistence Results Establish

Representative fixed plugins were compared in native DSH and OMD across both loading orders, enable/disable, restart, removal, and tool/skill/interface contributions. Later alpha.2 and local integrations have their own scope and do not inherit all old results.

Isolated Web checks used controlled models and fictional material. They do not establish real subscriptions, all OAuth workflows, every third-party version, or Windows native desktop acceptance. No Windows hardware test was performed this round. Native refusal is not successful installation.

<details>
<summary>Scopes and saved conversations</summary>

A plugin can contribute only to particular presets. Visibility in standard does not establish visibility in OMD.

Uninstall retains conversations, drafts, attachments, and settings, but saved conversations with a missing preset may need OMD, OMAA, or the original plugin restored. A new standard conversation does not establish automatic conversion of old conversations.

Optional failures should remain isolated from base behavior. Keep diagnostics for uncertain combinations and restore matching versions or disable the affected component.

</details>

## Conflicts and Recommendations

Record the three versions, loading order, profile, minimal reproduction, first error, and native DSH behavior. [Back up](upgrade_EN.md#2-stop-and-back-up), then [troubleshoot](troubleshooting_EN.md).

[Recommend a plugin/request adaptation (Chinese)](plugin-submissions.md) with a repository and one sentence about its purpose, whether yours or another open-source project.
