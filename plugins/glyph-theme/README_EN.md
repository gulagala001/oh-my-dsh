<a name="readme-top"></a>

<h1 align="center">Glyph</h1>

<p align="center"><strong>A whale, a flowing background and controls sharing one character grid.</strong><br>A DeepSeek Harness theme</p>

<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong></p>

<p align="center"><a href="#install">Get started</a> · <a href="#behavior">Display and interaction</a> · <a href="LICENSE">MIT license</a></p>

- **Dimensional character whale**: independent tail motion, shading and continuous transitions between full-body, head and tail views.
- **Local response**: the pointer disturbs nearby characters; background clicks produce traveling waves while motion avoids readable content.
- **Native interaction**: controls track scrolling, text remains selectable and copyable, and IME/accessibility behavior is retained.

<a id="install"></a>

## Quick start

Targets **DSH 0.2.1-rc.2**. Source and locally buildable archives are available; online downloads and marketplace availability depend on a formal release.

Build from the repository root:

```bash
node scripts/build-glyph-theme.mjs
npm pack ./plugins/glyph-theme
```

Add the generated `dsh-glyph-theme-1.0.0-dsh.0.2.1-rc.2.tgz` in the target DSH instance’s plugin manager and follow its activation/reload prompt. Replace the path and profile in this CLI example:

```bash
dsh plugin --profile web add file:/absolute/path/dsh-glyph-theme-1.0.0-dsh.0.2.1-rc.2.tgz
```

**First check:** create a conversation, move the pointer and click an empty part of the background. The whale and nearby characters respond while the composer remains readable and usable.

<a id="behavior"></a>

## Display and interaction

The theme uses deep black and bright white and follows the host’s light/dark preference. The reasoning-effort panel adds flowing tracks, level contrast and slider motion. The highest level uses DeepSeek blue and background waves; effects fade when the panel closes.

| Content | Behavior |
| --- | --- |
| Background, navigation and outer controls | Character-grid styling and motion. |
| Message text and composer | Readable native text and interaction, with motion kept away from content. |
| Settings, menus and dialogs | Solid reading surfaces; character controls follow native scrolling, clipping and popup stacking. |
| Images, video, PDFs, iframes and code editors | Original content rendering; surrounding controls follow the theme. |
| Reduced motion | Follows the system preference and can be lowered or disabled in Settings → Glyph. |

Preferences stay in the current browser. A standalone installation uses DeepSeek Harness branding text by default while preserving the character style and explicit custom names.

## FAQ

<details>
<summary>Does the theme change model capabilities or reasoning?</summary>

No. Effort-panel motion reflects the selected level. DSH still controls the actual model and request parameters.

</details>

<details>
<summary>How do I reduce animation or restore the ordinary appearance?</summary>

Lower or disable effects in Settings → Glyph, or disable the theme in plugin management to return to the host appearance.

</details>

## License

Code uses [MIT](LICENSE). DeepSeek names and graphics remain with their respective rights holders; no official affiliation or endorsement is implied.

[Back to top](#readme-top)
