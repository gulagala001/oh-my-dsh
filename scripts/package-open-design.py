#!/usr/bin/env python3
"""Build the pinned OpenDesign subpackage without executing upstream code."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile

COMMIT = 'a9d4f4c075d12f7825ee9e5a43f096af6b321055'
ARCHIVE_SHA256 = '790c3428ce1d0083768d178fad1138b8f99e4db8bae776dd4fa1be4d4950cadd'
VERSION = '0.1.0-omd.1.0.0'
PREFIX = 'dsh-open-design-' + COMMIT + '/'
OLD_GATE = '''**Verify mechanically, do not eyeball it.** `node tools/od-check.mjs
<index.html>` runs the P0 gate as code'''
NEW_GATE = '''**Verify mechanically, do not eyeball it.** Resolve
`../../tools/od-check.mjs` against this skill's base directory returned by the
`skill` tool, then run `node "<absolute checker path>" "<absolute index.html path>"`.
Do not resolve the checker against the project's working directory. It runs
the P0 gate as code'''


def sha(data):
    return hashlib.sha256(data).hexdigest()


def build(archive, destination):
    raw = archive.read_bytes()
    if sha(raw) != ARCHIVE_SHA256:
        raise ValueError('Pinned source archive SHA-256 mismatch')
    source = {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as tar:
        for member in tar.getmembers():
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
                raise ValueError('Unsafe source archive entry: ' + member.name)
            if member.isdir() and member.name == PREFIX.rstrip('/'):
                continue
            if not member.name.startswith(PREFIX):
                raise ValueError('Unexpected source root: ' + member.name)
            if member.isfile():
                source[member.name[len(PREFIX):]] = tar.extractfile(member).read()
    files = {name[len('dsh-open-design/'):]: data for name, data in source.items()
             if name.startswith('dsh-open-design/')}
    package = json.loads(files['package.json'])
    if package['name'] != 'dsh-open-design' or package['version'] != '0.1.0':
        raise ValueError('Unexpected upstream package')
    if package.get('dependencies') or package.get('scripts'):
        raise ValueError('Unexpected dependencies or scripts; re-review required')
    licenses = sorted(name for name in files if name.startswith('skills/')
                      and PurePosixPath(name).name.upper().startswith('LICENSE'))
    skills = sorted(name.split('/')[1] for name in files
                    if name.startswith('skills/') and name.count('/') == 2 and name.endswith('/SKILL.md'))
    if len(skills) != 52 or len(licenses) != 15:
        raise ValueError('Unexpected skill/license inventory')
    for name in ['LICENSE', 'NOTICE']:
        files[name] = source[name]
    files['UPSTREAM_README.md'] = source['README.md']
    files['tools/od-check.mjs'] = source['tools/od-check.mjs']
    router = files['skills/open-design/SKILL.md'].decode('utf-8')
    if router.count(OLD_GATE) != 1:
        raise ValueError('Router gate changed; re-review required')
    files['skills/open-design/SKILL.md'] = router.replace(OLD_GATE, NEW_GATE).encode('utf-8')
    package['version'] = VERSION
    package['files'] = ['lib', 'cordis.patch.yml', 'skills', 'tools/od-check.mjs',
                        'README.md', 'UPSTREAM_README.md', 'PROVENANCE.md', 'LICENSE', 'NOTICE', 'OMD_ADAPTER.json']
    package['omdAdapter'] = {'upstreamRepository': 'omegapaopao/dsh-open-design',
                             'upstreamCommit': COMMIT, 'upstreamVersion': '0.1.0',
                             'sourceArchiveSha256': ARCHIVE_SHA256, 'distribution': 'local-unpublished'}
    files['package.json'] = (json.dumps(package, ensure_ascii=False, indent=2) + '\n').encode()
    files['README.md'] = ('''# OpenDesign · DSH 技能桥接（OMD 本地适配）

来源：omegapaopao/dsh-open-design，固定提交 `%s`。这是一份尚未公开发布的
本地适配包，包身份仍为 `dsh-open-design`，适配版本 `%s`。它注册官方
`@deepseek-ai/dsh-skill-filesystem` provider，不修改系统人格或审批设置。

包含 52 个技能，保留上游 LICENSE、NOTICE、PROVENANCE.md 和全部 15 份组件
许可证。原始 README 原样保存在 UPSTREAM_README.md；NOTICE 中
`dsh-open-design/` 前缀指本包根目录。上游 README 的“使用时无网络”描述不能
覆盖所有技能：web-clone、brand-extract 等包含网络或浏览器流程，应依实际技能
说明、宿主权限和用户授权使用。原 NOTICE 写有 14 项，但列举并实际保留的是 15 份。

适配仅补齐发行资料、打包根目录的 tools/od-check.mjs，并将 router 的检查器
路径改为按 skill 工具返回的 base directory 解析。未运行 od-build，51 个
上游技能与所有模板、资源、许可证保持字节一致；router 仅修改检查器调用段。

要求 Node ^22.19.0 或 >=24.0.0。宿主兼容验收结果见随交付包的 evidence；
本 README 本身不宣称真实模型设计能力或跨平台验证。

## 本地安装（需用户授权，先在独立 profile 验证）

```sh
DSH_HOME="/absolute/path/to/isolated-home" dsh --profile open-design-test --from-default-profile web --dump-config
DSH_HOME="/absolute/path/to/isolated-home" dsh plugin --profile open-design-test add "file:/absolute/path/to/dsh-open-design-%s.tgz"
```

启停和卸载通过宿主“插件”页面操作。不要把整仓 codeload 当作子包安装包，也
不要运行主应用的 od agent setup。尚无适配版公开安装资产时，OMD 推荐卡片
只提供项目入口与状态说明。无需安装模型或联网技能即可发现这些技能。

## 检查器路径

加载 open-design 技能后，将 `../../tools/od-check.mjs` 以该技能 base directory
解析为绝对路径，使用 `node "<绝对检查器路径>" "<绝对HTML路径>"`。允许项目
路径有空格，也允许当前 cwd 与插件安装目录不同。检查器只读输入 HTML 和
关联本地资源；通过检查器不等于真实浏览器视觉验收。

署名与许可：桥接作者 omegapaopao；技能来源 nexu-io/open-design 及各技能作者。
完整原作者署名见 UPSTREAM_README.md、NOTICE、PROVENANCE.md 与技能目录。
''' % (COMMIT, VERSION, VERSION)).encode('utf-8')
    adapter = {'schemaVersion': 1, 'packageName': package['name'], 'version': VERSION,
               'source': package['omdAdapter'], 'skillCount': len(skills), 'skills': skills,
               'componentLicenses': {name: sha(files[name]) for name in licenses},
               'routerChange': {'file': 'skills/open-design/SKILL.md', 'old': OLD_GATE, 'new': NEW_GATE},
               'preserved': {name: sha(data) for name, data in source.items()
                             if name in ['LICENSE', 'NOTICE', 'README.md', 'tools/od-check.mjs']},
               'changedUpstreamPackageFiles': ['package.json', 'skills/open-design/SKILL.md']}
    files['OMD_ADAPTER.json'] = (json.dumps(adapter, ensure_ascii=False, indent=2) + '\n').encode()
    destination.mkdir(parents=True, exist_ok=True)
    package_dir = destination / 'package'
    if package_dir.exists():
        raise ValueError('Output package directory already exists; use a fresh destination')
    for name, data in sorted(files.items()):
        target = package_dir / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    tgz = destination / ('dsh-open-design-' + VERSION + '.tgz')
    with tgz.open('wb') as output:
        with gzip.GzipFile(filename='', mode='wb', fileobj=output, mtime=0, compresslevel=9) as zipped:
            with tarfile.open(fileobj=zipped, mode='w', format=tarfile.PAX_FORMAT) as tar:
                for name, data in sorted(files.items()):
                    info = tarfile.TarInfo('package/' + name)
                    info.size = len(data)
                    info.mode = 0o644
                    info.uid = info.gid = info.mtime = 0
                    info.uname = info.gname = ''
                    tar.addfile(info, io.BytesIO(data))
    manifest = {**adapter, 'asset': tgz.name, 'sha256': sha(tgz.read_bytes()),
                'files': {name: sha(data) for name, data in sorted(files.items())}}
    (destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'package': str(package_dir), 'tgz': str(tgz), 'sha256': manifest['sha256'],
                      'skills': len(skills), 'componentLicenses': len(licenses)}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_archive', type=Path)
    parser.add_argument('output_directory', type=Path)
    args = parser.parse_args()
    build(args.source_archive, args.output_directory)
