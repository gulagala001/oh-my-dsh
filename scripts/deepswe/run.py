"""Local DeepSWE launcher with isolated inputs, credentials and results."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from datetime import datetime, timezone


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('doctor')
    sub.add_parser('report')
    sub.add_parser('start')
    sub.add_parser('stop')
    sub.add_parser('order')
    monitor = sub.add_parser('monitor')
    monitor.add_argument('--port', type=int, default=8765)
    run = sub.add_parser('run')
    group = run.add_mutually_exclusive_group(required=True)
    group.add_argument('--task')
    group.add_argument('--sample', type=int)
    group.add_argument('--all', action='store_true')
    run.add_argument('--seed', type=int, default=0)
    run.add_argument('--job-name')
    run.add_argument('--concurrency', type=int, choices=(1, 2), default=1)
    run.add_argument('--retry-errors', action='store_true', help='Retry only unscored execution errors and cancellations')
    args = parser.parse_args()
    root = args.root.resolve()
    if args.command == 'monitor':
        from monitor import start
        print(start(root, args.port))
        return
    if args.command == 'order':
        from schedule import schedule
        order = schedule(root)
        print(json.dumps(order, ensure_ascii=False, indent=2))
        return
    settings = json.loads((root / 'config/local.json').read_text())
    (root / 'tmp').mkdir(exist_ok=True)
    env = {**os.environ, **settings['environment'],
           'TMPDIR': str(root / 'tmp'),
           'PYTHONPATH': str(Path(__file__).resolve().parent),
           'OMD_EVAL_BUNDLE': str(root / 'private/bundle'),
           'OMD_EVAL_IMAGES': str(root / 'config/image-manifests.json'),
           'OMD_EVAL_PROXY_PLATFORM': settings.get('proxy_platform', 'linux/amd64'),
           'OMD_EVAL_PROXY_IMAGE': settings.get('proxy_image', 'python:3.12-slim'),
           'OMD_DEEPSWE_MANAGED_DOCKER': '1',
           'PYTHONDONTWRITEBYTECODE': '1',
           'DOCKER_DEFAULT_PLATFORM': 'linux/amd64'}
    bundle = root / 'private/bundle'
    manifest = json.loads((bundle / 'manifest.json').read_text())
    if args.command in {'start', 'stop'}:
        subprocess.run(['colima', '-p', settings['colima_profile'], args.command,
                        *(['--activate=false', '--ssh-config=false', '--vz-rosetta=false'] if args.command == 'start' else [])],
                       env=env, check=True)
        if args.command == 'start' and settings.get('emulation') == 'qemu':
            subprocess.run(['colima', '-p', settings['colima_profile'], 'ssh', '--', 'sudo', 'sh', '-c',
                            'if [ -f /proc/sys/fs/binfmt_misc/rosetta ]; then echo 0 > /proc/sys/fs/binfmt_misc/rosetta; fi; '
                            'echo 1 > /proc/sys/fs/binfmt_misc/qemu-x86_64; '
                            'iptables -C INPUT -i ev+ -j DROP 2>/dev/null || iptables -I INPUT -i ev+ -j DROP; '
                            'ip6tables -C INPUT -i ev+ -j DROP 2>/dev/null || ip6tables -I INPUT -i ev+ -j DROP; '
                            'if [ -f /var/lib/omd-deepswe.swap ]; then '
                            'swapon --show=NAME --noheadings | grep -Fxq /var/lib/omd-deepswe.swap || swapon /var/lib/omd-deepswe.swap; fi'], env=env, check=True)
            # Lima's automatic DNS listener forwarding is not needed by evals.
            # Cancel only this VM's forwarding; retain its Docker Unix socket.
            instance = Path(env['LIMA_HOME']) / ('colima-' + settings['colima_profile'])
            ssh_config = (instance / 'ssh.config').read_text()
            port = re.search(r'^\s*Port\s+(\d+)', ssh_config, re.MULTILINE)
            user = re.search(r'^\s*User\s+(\S+)', ssh_config, re.MULTILINE)
            if port and user:
                subprocess.run(['ssh', '-F', '/dev/null', '-S', str(instance / 'ssh.sock'), '-O', 'cancel',
                                '-L', '0.0.0.0:53:0.0.0.0:53', '-p', port[1], user[1] + '@127.0.0.1'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return
    if args.command == 'report':
        from monitor import snapshot
        print(json.dumps(snapshot(root), ensure_ascii=False, indent=2))
        return
    for repo, commit in settings['upstream_commits'].items():
        current = subprocess.check_output(['git', '-C', str(root / 'upstream' / repo), 'rev-parse', 'HEAD'], text=True).strip()
        dirty = subprocess.check_output(['git', '-C', str(root / 'upstream' / repo), 'status', '--porcelain'], text=True).strip()
        if current != commit or dirty:
            raise SystemExit(f'Pinned upstream changed: {repo}')
    if sha(bundle / 'profile.tgz') != manifest['profileSHA256']:
        raise SystemExit('Profile archive does not match its snapshot')
    runtime = bundle / 'runtime-linux-amd64.tgz'
    if not runtime.is_file() or sha(runtime) != settings['runtime_sha256']:
        raise SystemExit('Runtime archive missing or modified')
    subprocess.run(['docker', 'info', '--format', '{{.ServerVersion}} {{.Architecture}}'], env=env, check=True)
    if settings.get('emulation') == 'qemu':
        subprocess.run(['colima', '-p', settings['colima_profile'], 'ssh', '--', 'sh', '-c',
                        'grep -q "^enabled$" /proc/sys/fs/binfmt_misc/qemu-x86_64 && '
                        '! grep -q "^enabled$" /proc/sys/fs/binfmt_misc/rosetta 2>/dev/null'], env=env, check=True)
        subprocess.run(['colima', '-p', settings['colima_profile'], 'ssh', '--', 'sudo', 'sh', '-c',
                        'iptables -C INPUT -i ev+ -j DROP && ip6tables -C INPUT -i ev+ -j DROP'], env=env, check=True)
    from pier.models.task.task import Task
    tasks = sorted((root / 'upstream/deep-swe/tasks').iterdir())
    tasks = [t for t in tasks if (t / 'task.toml').is_file()]
    for task in tasks:
        parsed = Task(task)
        if parsed.config.verifier.environment_mode != 'separate':
            raise SystemExit(f'Task lacks separate verification: {task.name}')
    if len(tasks) != settings['task_count']:
        raise SystemExit('Task count changed')
    images = json.loads((root / 'config/image-manifests.json').read_text())
    if len(images) != len(tasks) or any(row.get('error') or not row.get('digest') for row in images):
        raise SystemExit('Task image availability has not been fully verified')
    if args.command == 'doctor':
        print(json.dumps({'ready': True, 'tasks': len(tasks), 'selection': manifest['selection'],
                          'omd': manifest['omd_version'], 'plugins': len(manifest['plugins']),
                          'runtime_sha256': settings['runtime_sha256'], 'cached_registry_manifests': len(images)}, ensure_ascii=False, indent=2))
        return
    if args.sample is not None and not 1 <= args.sample <= len(tasks):
        raise SystemExit('--sample must be between 1 and the full task count')
    if args.task and args.task not in {t.name for t in tasks}:
        raise SystemExit('Unknown task; use an exact directory name in upstream/deep-swe/tasks')
    selection = manifest['selection']['model']
    from schedule import schedule
    ordered = schedule(root)['tasks']
    if args.task:
        ordered = [row for row in ordered if row['id'] == args.task]
    elif args.sample:
        import random
        selected = set(random.Random(args.seed).sample([r['id'] for r in ordered], args.sample))
        ordered = [row for row in ordered if row['id'] in selected]
    name = args.job_name or datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,100}', name):
        raise SystemExit('Job name must be a simple identifier, not a path')
    config = {
        'job_name': name, 'jobs_dir': str(root / 'jobs'), 'n_attempts': 1,
        'n_concurrent_trials': args.concurrency, 'retry': {'max_retries': 0},
        'environment': {'import_path': 'environment:EvaluationDockerEnvironment', 'delete': True},
        'agents': [{'import_path': 'agent:OMDAgent', 'model_name': f"{selection['provider']}/{selection['model']}",
                    'override_setup_timeout_sec': 900, 'kwargs': {'bundle_dir': str(bundle)}}],
        'quiet': True,
        'tasks': [{'path': str(root / 'upstream/deep-swe/tasks' / row['id'])} for row in ordered],
    }
    from pier.models.job.config import JobConfig
    JobConfig.model_validate(config)
    if args.concurrency == 2 or args.retry_errors:
        proof_path = root / 'config/continuation-validation.json'
        proof = json.loads(proof_path.read_text()) if proof_path.exists() else {}
        if (not proof.get('passed') or proof.get('confirmed_cached_continuations', 0) < 3
                or proof.get('recovered_500', 0) < 1 or proof.get('server_errors') != 0
                or proof.get('gateway_sha256') != sha(Path(__file__).with_name('gateway.py'))
                or proof.get('gateway_state_sha256') != sha(Path(__file__).with_name('gateway_state.py'))):
            raise SystemExit('The current gateway has not passed the real cached-continuation validation')
    if args.concurrency == 2 and settings.get('emulation') == 'qemu':
        subprocess.run(['colima', '-p', settings['colima_profile'], 'ssh', '--', 'sh', '-c',
                        "swapon --show=NAME --noheadings | grep -Fxq /var/lib/omd-deepswe.swap"], env=env, check=True)
    config_path = root / 'config' / f'job-{name}.json'
    if config_path.exists() or (root / 'jobs' / name).exists():
        raise SystemExit('Job already exists; automatic resume/rerun is disabled')
    import fcntl
    with (root / '.run.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('Another evaluation is already running in this environment')
        from runner import claim_path
        for row in ordered:
            claim_path(root, row['id'], args.retry_errors)
        config_path.write_text(json.dumps(config, indent=2))
        env.update({'OMD_EVAL_CONCURRENCY': str(args.concurrency),
                    'OMD_EVAL_RETRY_ERRORS': '1' if args.retry_errors else '0'})
        # The child retains the lock if this launcher is interrupted.
        result = subprocess.run([str(root / '.venv/bin/python'), str(Path(__file__).with_name('runner.py')),
                                 str(root), str(config_path)], env=env, pass_fds=(lock.fileno(),))
        raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
