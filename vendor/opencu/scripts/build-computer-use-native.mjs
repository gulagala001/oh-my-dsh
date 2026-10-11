import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { signNativeBundle } from './computer-use-signing.mjs';
import { nativeBuildInfo, NATIVE_SOURCES, NATIVE_SWIFT_SOURCES } from '../src/computer-use/native-build.mjs';

if(process.platform!=='darwin')throw new Error('This native target is macOS; build and test it on macOS.');
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.env.TRISOUL_CU_NATIVE_OUTPUT??join(root,'dist','Oh My DSH Computer Use.app'));
await mkdir(join(output,'Contents','MacOS'),{recursive:true});
const build=await nativeBuildInfo();
const temporary=await mkdtemp(join(tmpdir(),'opencu-native-build-'));
try {
  const target=`${process.arch==='arm64'?'arm64':'x86_64'}-apple-macosx14.0`;
  const swiftInfo=JSON.parse(execFileSync('xcrun',['swiftc','-target',target,'-print-target-info'],{encoding:'utf8'}));
  const objects=NATIVE_SWIFT_SOURCES.map(name=>{
    const object=join(temporary,name+'.o');
    execFileSync('xcrun',['swiftc','-parse-as-library','-emit-object','-O','-target',target,join(root,'native','computer-use',name),'-o',object],{stdio:'inherit'});
    return object;
  });
  const libraries=swiftInfo.paths?.runtimeLibraryPaths;
  if(!Array.isArray(libraries)||libraries.some(path=>typeof path!=='string'||!path.startsWith('/')))throw new Error('The Swift runtime library paths are unavailable');
  execFileSync('clang',['-fobjc-arc','-fblocks','-O2','-mmacosx-version-min=14.0','-Werror=return-type',`-DTRISOUL_BUILD_ID="${build.build}"`,`-DTRISOUL_VERSION="${build.version}"`,`-DTRISOUL_PROTOCOL=${build.protocol}`,'-framework','Cocoa','-framework','ApplicationServices','-framework','Carbon','-framework','CoreText','-framework','ImageIO','-framework','ScreenCaptureKit','-framework','CoreMedia','-framework','CoreVideo','-framework','QuartzCore','-framework','VideoToolbox','-framework','AVFoundation','-framework','Security','-lbsm',...libraries.flatMap(path=>['-L',path]),'-Wl,-rpath,/usr/lib/swift',...NATIVE_SOURCES.map(f=>join(root,'native','computer-use',f)),...objects,'-o',join(output,'Contents','MacOS','trisoul-computer-use')],{stdio:'inherit'});
} finally { await rm(temporary,{recursive:true,force:true}); }
await writeFile(join(output,'Contents','Info.plist'),'<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>ai.trisoul.computer-use</string><key>CFBundleName</key><string>Oh My DSH Computer Use</string><key>CFBundleDisplayName</key><string>Oh My DSH Computer Use</string><key>CFBundleExecutable</key><string>trisoul-computer-use</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>CFBundleVersion</key><string>1</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>LSUIElement</key><true/><key>NSScreenCaptureUsageDescription</key><string>Capture the application window you selected for Computer Use.</string></dict></plist>');
execFileSync('plutil',['-replace','CFBundleShortVersionString','-string',build.version,join(output,'Contents/Info.plist')]);
execFileSync('plutil',['-replace','CFBundleVersion','-string','2',join(output,'Contents/Info.plist')]);
execFileSync('plutil',['-insert','TrisoulBuildID','-string',build.build,join(output,'Contents/Info.plist')]);
execFileSync('plutil',['-insert','TrisoulProtocol','-integer',String(build.protocol),join(output,'Contents/Info.plist')]);
await mkdir(join(output,'Contents','Resources'),{recursive:true});
await copyFile(join(root,'native','computer-use','resources','SoftwareCursor.png'),join(output,'Contents','Resources','SoftwareCursor.png'));
await signNativeBundle(output);
console.log(output);
