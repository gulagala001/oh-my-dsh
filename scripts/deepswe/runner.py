"""Ordered, once-only execution. Claims survive interruption; no automatic reruns."""
import asyncio
import json
import os
import signal
import shutil
import sys
import time
from pathlib import Path

from pier.job import Job
from pier.models.job.config import JobConfig
from audit import audit_job
from monitor import add_usage, aggregate, read, receipts


def claim_path(root, task, retry_errors):
    claims = root / 'attempts'
    original = claims / (task + '.json')
    retry = claims / (task + '.retry.json')
    if not original.exists():
        if retry.exists():
            raise ValueError('Inconsistent prior attempt records: ' + task)
        return original
    if not retry_errors or retry.exists():
        raise ValueError('Task already attempted: ' + task)
    previous = json.loads(original.read_text())
    if previous.get('task') != task or not all(isinstance(previous.get(k), str) and '/' not in previous[k] and '..' not in previous[k] for k in ('job', 'trial')):
        raise ValueError('Invalid prior attempt: ' + task)
    path = root / 'jobs' / previous['job'] / previous['trial'] / 'result.json'
    detail = json.loads(path.read_text())
    if Path(detail['config']['task']['path']).name != task or not detail.get('exception_info') or detail.get('verifier_result') is not None:
        raise ValueError('Only unscored execution exceptions or cancellations can be retried: ' + task)
    return retry


async def prune_images():
    """Only between batches, when neither task nor verifier is running."""
    process = await asyncio.create_subprocess_exec('docker', 'image', 'ls', '--format', '{{.Repository}}:{{.Tag}}', stdout=asyncio.subprocess.PIPE)
    stdout, _ = await process.communicate()
    if process.returncode:
        raise RuntimeError('Cannot inspect dedicated evaluation image cache')
    for name in set(stdout.decode().splitlines()):
        if name.startswith('public.ecr.aws/d3j8x8q7/swe-bench-202605:'):
            child = await asyncio.create_subprocess_exec('docker', 'image', 'rm', name, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            await child.wait()
    child = await asyncio.create_subprocess_exec('docker', 'buildx', 'prune', '--force', '--max-used-space', '8GB', stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    await child.wait()
    if child.returncode:
        raise RuntimeError('Evaluation build cache cleanup failed')


def clear_error_for_retry(root, job_dir, trial):
    """Remove an unscored failed attempt, retaining only aggregate expenditure."""
    task = Path(trial.task.path).name
    next_claim = claim_path(root, task, True)
    trial_dir = job_dir / trial.trial_name
    if trial_dir.is_symlink() or not trial_dir.is_dir() or trial_dir.resolve().parent != job_dir.resolve():
        raise ValueError('Unsafe failed trial directory')
    config = read(root / 'config/monitor.json') or read(Path(__file__).with_name('monitor-defaults.json'))
    calls, _ = receipts(trial_dir)
    expense = aggregate(calls, config['pricing'])
    old = read(root / 'config/cleared-spend.json', {}).get('usage')
    merged = add_usage(expense, old)
    with next_claim.open('x') as handle:
        json.dump({'job': job_dir.name, 'trial': trial.trial_name, 'task': task,
                   'started_at': time.time(), 'retry_of_execution_error': True}, handle)
    temporary = root / 'tmp' / ('cleared-' + trial.trial_name)
    if temporary.exists():
        raise ValueError('Failed-trial cleanup target already exists')
    trial_dir.rename(temporary)
    path = root / 'config/cleared-spend.json'
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps({'usage': merged, 'note': 'Aggregate expenditure only; unscored execution records were removed.'}, indent=2))
    temp.replace(path)
    shutil.rmtree(temporary)


async def execute(root, config_path):
    root = Path(root)
    config = JobConfig.model_validate_json(Path(config_path).read_text())
    if config.n_attempts != 1 or config.n_concurrent_trials not in (1, 2) or config.retry.max_retries != 0:
        raise ValueError('Single pass requires one attempt, up to two workers and no automatic retries')
    retry_errors = os.environ.get('OMD_EVAL_RETRY_ERRORS') == '1'
    job_dir = root / 'jobs' / config.job_name
    claims = root / 'attempts'
    claims.mkdir(exist_ok=True)
    planned = [Path(t.path).name for t in config.tasks]
    if len(planned) != len(set(planned)) or config.datasets:
        raise ValueError('Explicit unique ordered tasks required')
    for name in planned:
        claim_path(root, name, retry_errors)

    class OrderedJob(Job):
        async def _run_trials_with_queue(self, *_args, **_kwargs):
            results = []
            audit_lock = asyncio.Lock()
            self.halted = False
            async def run_one(trial):
                result = await self._trial_queue.submit(trial)
                if result.exception_info and getattr(result.exception_info, 'exception_type', None) != 'CancelledError':
                    async with audit_lock:
                        await asyncio.to_thread(clear_error_for_retry, root, job_dir, trial)
                    result = await self._trial_queue.submit(trial)
                if result.exception_info:
                    self.halted = True
                async with audit_lock:
                    report = await asyncio.to_thread(audit_job, root, job_dir, trial.trial_name)
                    row = next((r for r in report['trials'] if r['trial'] == trial.trial_name), None)
                    if not row or row['status'] != 'verified':
                        self.halted = True
                return result
            remaining = iter(self._remaining_trial_configs)
            while not self.halted:
                batch = []
                for _ in range(config.n_concurrent_trials):
                    trial = next(remaining, None)
                    if trial is None:
                        break
                    task = Path(trial.task.path).name
                    claim = claim_path(root, task, retry_errors)
                    with claim.open('x') as handle:
                        json.dump({'job': config.job_name, 'trial': trial.trial_name,
                                   'task': task, 'started_at': time.time(), 'retry_of_execution_error': claim.name.endswith('.retry.json')}, handle)
                    batch.append(trial)
                if not batch:
                    break
                results.extend(await asyncio.gather(*(run_one(trial) for trial in batch)))
                if not self.halted and config.n_concurrent_trials > 1:
                    await prune_images()
            return results

    job = await OrderedJob.create(config)
    def state(status, **extra):
        path = job_dir / 'run-status.json'
        tmp = path.with_suffix('.tmp')
        tmp.write_text(json.dumps({'status': status, 'pid': os.getpid(), 'at': time.time(), **extra}))
        tmp.replace(path)
    state('running')
    current = asyncio.current_task()
    asyncio.get_running_loop().add_signal_handler(signal.SIGTERM, current.cancel)
    try:
        result = await job.run()
        report = await asyncio.to_thread(audit_job, root, job_dir)
        state('halted-error' if job.halted else 'completed')
        return int(bool(job.halted or result.stats.n_errored_trials or report['review_required']))
    except BaseException as error:
        state('interrupted', reason=type(error).__name__)
        raise


if __name__ == '__main__':
    raise SystemExit(asyncio.run(execute(sys.argv[1], sys.argv[2])))
