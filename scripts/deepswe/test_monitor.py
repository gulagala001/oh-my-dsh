"""Small offline checks for billing, reference reads and single-pass dispatch."""
import asyncio
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import monitor
import runner

PRICING = {'bailian': {'peak': {'input': 2, 'cached': .2, 'output': 8},
                       'off_peak': {'input': 1, 'cached': .1, 'output': 4}},
           'reference_peak_usd': {'input': .3, 'cached': .006, 'output': 1.2}}


class Checks(unittest.TestCase):
    def test_cache_and_reasoning_are_not_double_counted(self):
        u = monitor.usage({'input_tokens': 1000, 'output_tokens': 100,
                           'input_tokens_details': {'cached_tokens': 800},
                           'output_tokens_details': {'reasoning_tokens': 90}})
        self.assertEqual(u['tokens'], 1100)
        self.assertEqual(u['uncached'], 200)
        call = {'at': 1793145600, 'usage': u}  # 2026-10-28 00:00 UTC, Beijing 08:00.
        self.assertAlmostEqual(monitor.priced(call, PRICING)['cny'][0], .00136)
        call['at'] -= 1
        self.assertAlmostEqual(monitor.priced(call, PRICING)['cny'][0], .00068)

    def test_unknown_usage_and_cache_are_not_zero(self):
        self.assertIsNone(monitor.usage(None))
        u = monitor.usage({'input_tokens': 1000, 'output_tokens': 100})
        bounds = monitor.priced({'at': 1793145600, 'usage': u}, PRICING)['cny']
        self.assertLess(bounds[0], bounds[1])
        totals = monitor.aggregate([{'usage': None}], PRICING)
        self.assertEqual(totals['missing'], 1)

    def test_native_input_convention(self):
        u = monitor.usage({'inputTokens': 3389, 'cacheReadTokens': 18432,
                           'outputTokens': 237, 'totalTokens': 22058}, True)
        self.assertEqual((u['input'], u['tokens']), (21821, 22058))

    def test_get_and_duplicate_receipts_do_not_charge_twice(self):
        with tempfile.TemporaryDirectory() as d:
            trial = Path(d); ledger = trial / 'gateway-audit'; ledger.mkdir()
            usage = {'input_tokens': 100, 'output_tokens': 10}
            rows = [{'kind': 'request', 'id': 'a', 'method': 'POST', 'at': 1},
                    {'kind': 'response', 'id': 'a', 'status': 200, 'usage': usage, 'at': 2},
                    {'kind': 'response', 'id': 'a', 'status': 200, 'usage': usage, 'at': 2},
                    {'kind': 'request', 'id': 'b', 'method': 'GET', 'at': 3},
                    {'kind': 'response', 'id': 'b', 'status': 200, 'usage': usage, 'at': 4},
                    {'kind': 'request', 'id': 'c', 'method': 'POST', 'at': 5}]
            (ledger / 'requests.jsonl').write_text('\n'.join(map(json.dumps, rows)) + '\n{"partial":')
            calls, _ = monitor.receipts(trial)
            self.assertEqual(len(calls), 2)
            self.assertEqual(monitor.aggregate(calls, PRICING)['tokens'], 110)
            self.assertEqual(monitor.aggregate(calls, PRICING)['missing'], 1)

    def test_ordered_once_only_runner(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); (root / 'jobs/once').mkdir(parents=True)
            config = {'job_name': 'once', 'jobs_dir': str(root / 'jobs'),
                      'n_concurrent_trials': 1, 'n_attempts': 1, 'retry': {'max_retries': 0},
                      'tasks': [{'path': str(root / n)} for n in ['hard', 'easy']]}
            file = root / 'config.json'; file.write_text(json.dumps(config))
            seen = []
            async def submit(trial):
                seen.append(Path(trial.task.path).name)
                return SimpleNamespace()
            async def create(cls, _config):
                obj = object.__new__(cls)
                obj._remaining_trial_configs = [SimpleNamespace(task=SimpleNamespace(path=root / n), trial_name=n) for n in ['hard', 'easy']]
                obj._trial_queue = SimpleNamespace(submit=submit)
                return obj
            async def run(obj):
                await obj._run_trials_with_queue()
                return SimpleNamespace(stats=SimpleNamespace(n_errored_trials=0))
            with patch.object(runner.Job, 'create', classmethod(create)), patch.object(runner.Job, 'run', run), patch.object(runner, 'audit_job', return_value={'review_required': 0}):
                self.assertEqual(asyncio.run(runner.execute(root, file)), 0)
                with self.assertRaisesRegex(ValueError, 'already been attempted'):
                    asyncio.run(runner.execute(root, file))
            self.assertEqual(seen, ['hard', 'easy'])


if __name__ == '__main__':
    unittest.main()
