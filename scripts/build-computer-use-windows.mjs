import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { msbuildValue, windowsBridgeBuild } from '../src/computer-use/windows-build.mjs';

const info = await windowsBridgeBuild(process.env.TRISOUL_CU_WINDOWS_ARCH || process.arch);
const output = resolve(process.env.TRISOUL_CU_WINDOWS_OUTPUT || fileURLToPath(new URL('../dist/computer-use-' + info.rid, import.meta.url)));
const intermediate = await mkdtemp(join(tmpdir(), 'oh-my-dsh-win-build-'));
try {
  await mkdir(output, { recursive: true });
  const command = process.env.TRISOUL_CU_DOTNET || 'dotnet';
  const args = ['publish', fileURLToPath(new URL('../native/computer-use/windows/TrisoulBrowserBridge.csproj', import.meta.url)), '-c', 'Release', '-r', info.rid, '--self-contained', 'true', '-p:PublishSingleFile=true', '-p:TrisoulBuild=' + info.build, '-p:BaseIntermediateOutputPath=' + msbuildValue(intermediate) + '/', '-p:PublishDir=' + msbuildValue(output) + '/', '--nologo'];
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true, env: { ...process.env, DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' } });
    child.once('error', error => reject(error.code === 'ENOENT' ? new Error('安装 Chrome 连接需要 .NET 10 SDK，请安装后重试。') : error));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Windows browser bridge build failed (' + code + ')')));
  });
  console.log(JSON.stringify({ ...info, output }));
} finally { await rm(intermediate, { recursive: true, force: true }); }
