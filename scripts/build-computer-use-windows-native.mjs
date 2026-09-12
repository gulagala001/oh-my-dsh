import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { windowsNativeBuild } from '../src/computer-use/windows-native-build.mjs';
import { msbuildValue } from '../src/computer-use/windows-build.mjs';

const info = await windowsNativeBuild(process.env.TRISOUL_CU_WINDOWS_ARCH || process.arch);
const output = resolve(process.env.TRISOUL_CU_WINDOWS_NATIVE_OUTPUT || fileURLToPath(new URL('../dist/desktop-' + info.rid, import.meta.url)));
const intermediate = await mkdtemp(join(tmpdir(), 'oh-my-dsh-desktop-build-'));
try {
  await mkdir(output, { recursive: true });
  const args = ['publish', fileURLToPath(new URL('../native/computer-use/windows/desktop/TrisoulDesktop.csproj', import.meta.url)), '-c', 'Release', '-r', info.rid, '--self-contained', 'true', '-p:PublishSingleFile=true', '-p:IncludeNativeLibrariesForSelfExtract=true', '-p:TrisoulBuild=' + info.build, '-p:BaseIntermediateOutputPath=' + msbuildValue(intermediate) + '/', '-p:PublishDir=' + msbuildValue(output) + '/', '--nologo'];
  await new Promise((resolve, reject) => {
    const child = spawn(process.env.TRISOUL_CU_DOTNET || 'dotnet', args, { stdio: 'inherit', windowsHide: true, env: { ...process.env, DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' } });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Windows desktop build failed (' + code + ')')));
  });
  if ((await windowsNativeBuild(info.arch)).build !== info.build) throw new Error('Desktop sources changed during build; build again.');
  await writeFile(join(output, 'build.json'), JSON.stringify({ ...info, capabilities: ['windows', 'applications', 'launch-app', 'accessibility', 'screenshots', 'preview', 'keyboard', 'click', 'drag', 'paste', 'uia-actions', 'structured-scroll'], input: true }) + '\n');
  console.log(JSON.stringify({ ...info, output }));
} finally { await rm(intermediate, { recursive: true, force: true }); }
