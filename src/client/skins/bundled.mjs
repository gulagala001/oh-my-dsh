import liquidGlass from './bundled/ios-liquid-glass.json' with { type: 'json' };
import codexDesktop from './bundled/codex-desktop.json' with { type: 'json' };
import claudeTerminal from './bundled/claude-cli-terminal.json' with { type: 'json' };
import claudeDesktop from './bundled/claude-desktop.json' with { type: 'json' };
import materialExpressive from './bundled/google-material-expressive.json' with { type: 'json' };
import glyphMotion from './bundled/glyph-motion.json' with { type: 'json' };
import assets from './bundled/assets.json' with { type: 'json' };
export const bundledSkins = [codexDesktop, liquidGlass, claudeDesktop, claudeTerminal, materialExpressive, glyphMotion];
// Skin id → content-hashed CSS file the host plugin serves; loaded on first use.
export const bundledAssets = assets;
