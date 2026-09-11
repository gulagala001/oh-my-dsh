import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { signNativeBundle } from '../../../scripts/computer-use-signing.mjs';
import { NATIVE_SOURCES } from '../../../src/computer-use/native-build.mjs';

// A real signed daemon with old wire/build metadata. Tests never replace the
// user's application and do not depend on an archived native binary.
export async function legacyBundle(root) {
  const app=join(root,'Trisoul Computer Use.app'),binary=join(app,'Contents/MacOS/trisoul-computer-use');
  await mkdir(join(app,'Contents/MacOS'),{recursive:true});
  execFileSync('clang',['-fobjc-arc','-O2','-mmacosx-version-min=14.0','-DTRISOUL_BUILD_ID="legacy-test-build"','-DTRISOUL_VERSION="0.1.0"','-DTRISOUL_PROTOCOL=0','-framework','Cocoa','-framework','ApplicationServices','-framework','ImageIO','-framework','ScreenCaptureKit','-framework','CoreMedia','-framework','CoreVideo',...NATIVE_SOURCES.map(name=>new URL('../../../native/computer-use/'+name,import.meta.url).pathname),'-o',binary]);
  await writeFile(join(app,'Contents/Info.plist'),'<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>ai.trisoul.computer-use</string><key>CFBundleName</key><string>Trisoul Computer Use</string><key>CFBundleExecutable</key><string>trisoul-computer-use</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>CFBundleVersion</key><string>1</string><key>LSUIElement</key><true/></dict></plist>');
  await signNativeBundle(app);return binary;
}
