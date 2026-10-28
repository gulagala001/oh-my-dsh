"""Controller-side result audit. Never executes candidate code on the host."""
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
import uuid


def regular_file(path, boundary):
    path = Path(path)
    if path.is_symlink() or not path.resolve().is_relative_to(boundary.resolve()):
        raise ValueError('Output escapes its verifier directory or is a symlink')
    if not path.is_file() or path.stat().st_size > 128 * 1024 * 1024:
        raise ValueError('Missing or oversized verifier output: ' + path.name)
    return path


def inspect_patch(path, boundary):
    regular_file(path, boundary)
    process = subprocess.run(['git', 'apply', '--numstat', '-z', '--allow-empty', str(path)],
                             capture_output=True, timeout=15)
    if process.returncode:
        raise ValueError('Submitted patch cannot be parsed independently')
    entries = iter(process.stdout.decode('utf-8').split('\0'))
    paths = []
    for entry in entries:
        if not entry:
            continue
        parts = entry.split('\t', 2)
        if len(parts) != 3:
            raise ValueError('Malformed patch path record')
        if parts[2]:
            paths.append(parts[2])
        else:
            paths.extend([next(entries), next(entries)])
    flags = []
    runners = re.compile(r'^(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|pytest\.ini|conftest\.py|tox\.ini|(?:vitest|vite|jest|playwright)\.config\.[^/]+)$')
    for name in paths:
        parts = PurePosixPath(name)
        if parts.is_absolute() or '..' in parts.parts or parts.parts[0] in {'.git', 'node_modules'}:
            flags.append('protected-path:' + name)
        elif runners.fullmatch(name):
            # A legitimate dependency change can also trigger this. Keep the
            # official score, but require review before counting it as trusted.
            flags.append('test-runner-or-dependency-change:' + name)
    text = path.read_text(errors='replace')
    markers = re.compile(r'/logs/verifier|/tests/(?:grader\.py|config\.json|test\.sh)|reward\.(?:json|txt)|f2p_node_ids|p2p_node_ids|/solution/solve\.sh')
    if any(markers.search(line[1:]) for line in text.splitlines() if line.startswith('+') and not line.startswith('+++')):
        flags.append('verifier-or-reference-access-in-added-code')
    return {'paths': sorted(set(paths)), 'flags': sorted(set(flags))}


def regrade(root, task, trial, raw, settings, env):
    """Run the fixed official report parser in a networkless, read-only sandbox."""
    verifier = trial / 'verifier'
    config = json.loads((task / 'tests/config.json').read_text())
    mounts = []
    reports = []
    for index, name in enumerate(config['grade']['reports']):
        relative = str(name).removeprefix('/logs/verifier/')
        if PurePosixPath(relative).is_absolute() or '..' in PurePosixPath(relative).parts:
            raise ValueError('Unexpected official report path')
        candidates = [verifier / relative, verifier / 'reports' / relative]
        source = next((p for p in candidates if p.exists() or p.is_symlink()), candidates[0])
        regular_file(source, verifier)
        destination = f'/reports/{index}'
        mounts.extend(['--mount', f'type=bind,src={source.resolve()},dst={destination},readonly'])
        reports.append(destination)
    (root / 'tmp').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=root / 'tmp', prefix='regrade-') as temporary:
        scratch = Path(temporary)
        config['grade']['reports'] = reports
        (scratch / 'config.json').write_text(json.dumps(config))
        (scratch / 'out').mkdir()
        container = 'omd-deepswe-audit-' + uuid.uuid4().hex[:12]
        command = ['docker', 'run', '--rm', '--name', container, '--network', 'none', '--read-only',
                   '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--tmpfs', '/tmp',
                   '--memory', '512m', '--cpus', '1', '--user', f'{os.getuid()}:{os.getgid()}',
                   '--platform', settings['proxy_platform'],
                   '--mount', f'type=bind,src={(task / "tests/grader.py").resolve()},dst=/source/grader.py,readonly',
                   '--mount', f'type=bind,src={scratch / "config.json"},dst=/source/config.json,readonly',
                   '--mount', f'type=bind,src={scratch / "out"},dst=/out',
                   '-e', 'TESTS_DIR=/source', '-e', 'VERIFIER_DIR=/out', '-e', 'PYTHONDONTWRITEBYTECODE=1',
                   *mounts, settings['proxy_image'], 'python', '/source/grader.py', 'grade']
        if raw.get('apply_failed'):
            command.append('--apply-failed')
        try:
            result = subprocess.run(command, env=env, capture_output=True, timeout=45)
            (trial / 'regrade.log').write_bytes(result.stdout + result.stderr)
            if result.returncode:
                raise ValueError('Independent score recomputation failed')
            verified = json.loads((scratch / 'out/reward.json').read_text())
        finally:
            subprocess.run(['docker', 'rm', '-f', container], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if verified != raw:
        raise ValueError('Published reward does not match the independently recomputed test results')
    return verified


def audit_job(root, job_dir):
    root, job_dir = Path(root).resolve(), Path(job_dir).resolve()
    settings = json.loads((root / 'config/local.json').read_text())
    env = {**os.environ, **settings['environment'], 'TMPDIR': str(root / 'tmp')}
    dataset = root / 'upstream/deep-swe'
    dirty = subprocess.check_output(['git', '-C', str(dataset), 'status', '--porcelain'], text=True).strip()
    commit = subprocess.check_output(['git', '-C', str(dataset), 'rev-parse', 'HEAD'], text=True).strip()
    source_ok = not dirty and commit == settings['upstream_commits']['deep-swe']
    rows = []
    for file in sorted(job_dir.glob('*/result.json')):
        detail = json.loads(file.read_text())
        trial = file.parent
        row = {'trial': trial.name, 'official_reward': (detail.get('verifier_result') or {}).get('rewards', {}).get('reward'),
               'accepted_reward': None, 'flags': [], 'warnings': []}
        try:
            task = Path(detail['config']['task']['path']).resolve()
            if not source_ok or task.parent != (dataset / 'tasks').resolve():
                raise ValueError('Task source is not the clean, pinned official dataset')
            if detail.get('exception_info'):
                raise ValueError('Trial has an execution exception')
            patch = inspect_patch(trial / 'artifacts/model.patch', trial / 'artifacts')
            row['patch_paths'] = patch['paths']
            row['flags'].extend(patch['flags'])
            raw = json.loads(regular_file(trial / 'verifier/reward.json', trial / 'verifier').read_text())
            row['recomputed_reward'] = regrade(root, task, trial, raw, settings, env)['reward']
            if row['official_reward'] != row['recomputed_reward']:
                raise ValueError('Pier result and verifier reward differ')
            ledger = trial / 'gateway-audit/requests.jsonl'
            events = [json.loads(line) for line in regular_file(ledger, trial / 'gateway-audit').read_text().splitlines()]
            if not any(event.get('kind') == 'policy' for event in events):
                raise ValueError('No controller-owned inference policy receipt')
            requests = [e for e in events if e.get('kind') == 'request' and e.get('method') == 'POST']
            if not requests:
                raise ValueError('No real model inference receipt is present')
            responses = [e for e in events if e.get('kind') == 'response' and isinstance(e.get('usage'), dict)]
            row['inference_calls'] = len(requests)
            row['blocked_requests'] = [e.get('reason') for e in events if e.get('kind') == 'blocked']
            row['provider_usage'] = [e['usage'] for e in responses]
            row['usage_missing_calls'] = len(requests) - len(responses)
            if row['usage_missing_calls']:
                row['warnings'].append('Some provider calls did not return complete usage')
            if not row['flags'] and row['official_reward'] in (0, 1):
                row['accepted_reward'] = row['official_reward']
        except Exception as error:
            row['flags'].append(str(error))
        row['status'] = 'verified' if row['accepted_reward'] is not None else 'review-required'
        rows.append(row)
    job = json.loads((job_dir / 'result.json').read_text())
    total = job['n_total_trials']
    passed = sum(row['accepted_reward'] == 1 for row in rows)
    report = {'completed': bool(job.get('finished_at')), 'requested_trials': total, 'audited_trials': len(rows),
              'trusted_passes': passed, 'trusted_pass_rate': passed / total if total else None,
              'review_required': sum(row['status'] != 'verified' for row in rows), 'trials': rows,
              'scope': 'Isolation, transport policy, patch screening and independent report recomputation; not a proof against every possible runtime test exploit.'}
    (job_dir / 'audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    return report


if __name__ == '__main__':
    import sys
    print(json.dumps(audit_job(sys.argv[1], sys.argv[2]), ensure_ascii=False, indent=2))
