"""Ordered, once-only execution. Claims survive interruption; no automatic reruns."""
import asyncio
import json
import os
import signal
import sys
import time
from pathlib import Path

from pier.job import Job
from pier.models.job.config import JobConfig
from audit import audit_job


async def execute(root, config_path):
    root = Path(root)
    config = JobConfig.model_validate_json(Path(config_path).read_text())
    if config.n_attempts != 1 or config.n_concurrent_trials != 1 or config.retry.max_retries != 0:
        raise ValueError('Single pass requires one attempt, one worker and no retries')
    job_dir = root / 'jobs' / config.job_name
    claims = root / 'attempts'
    claims.mkdir(exist_ok=True)
    planned = [Path(t.path).name for t in config.tasks]
    if len(planned) != len(set(planned)) or config.datasets:
        raise ValueError('Explicit unique ordered tasks required')
    if any((claims / (name + '.json')).exists() for name in planned):
        raise ValueError('A selected task has already been attempted; it will not be run twice')

    class OrderedJob(Job):
        async def _run_trials_with_queue(self, *_args, **_kwargs):
            results = []
            for trial in self._remaining_trial_configs:
                task = Path(trial.task.path).name
                with (claims / (task + '.json')).open('x') as handle:
                    json.dump({'job': config.job_name, 'trial': trial.trial_name,
                               'task': task, 'started_at': time.time()}, handle)
                result = await self._trial_queue.submit(trial)
                results.append(result)
                await asyncio.to_thread(audit_job, root, job_dir, trial.trial_name)
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
        state('completed' if not result.stats.n_errored_trials and not report['review_required'] else 'completed-with-issues')
        return int(bool(result.stats.n_errored_trials or report['review_required']))
    except BaseException as error:
        state('interrupted', reason=type(error).__name__)
        raise


if __name__ == '__main__':
    raise SystemExit(asyncio.run(execute(sys.argv[1], sys.argv[2])))
