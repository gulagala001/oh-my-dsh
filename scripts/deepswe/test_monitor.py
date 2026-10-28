"""Small offline checks for billing, reference reads and single-pass dispatch."""
import asyncio
import ast
import json
import io
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import monitor
import runner
import security
from gateway_state import ResponseHistory, known_bailian_continuation_error

PRICING = {'bailian': {'peak': {'input': 2, 'cached': .2, 'output': 8},
                       'off_peak': {'input': 1, 'cached': .1, 'output': 4}},
           'reference_peak_usd': {'input': .3, 'cached': .006, 'output': 1.2}}


class Checks(unittest.TestCase):
    def test_trial_local_history_and_narrow_fallback(self):
        h=ResponseHistory(max_bytes=4096,max_entries=2)
        first=[{'role':'user','content':'test'}]
        output=[{'type':'reasoning','content':[{'type':'reasoning_text','text':'think'}]},
                {'type':'function_call','call_id':'call1','name':'run_code','arguments':'{}'}]
        h.remember({'id':'resp1','status':'completed','output':output},first)
        delta=[{'type':'function_call_output','call_id':'call1','output':'ok'}]
        self.assertEqual(h.input_for({'previous_response_id':'resp1','input':delta}), first+output+delta)
        self.assertIsNone(h.input_for({'previous_response_id':'other-trial','input':delta}))
        h.observe_readback({'status':'completed','store':True,'output':[{'type':'function_call'}]})
        self.assertIsNone(h.input_for({'previous_response_id':'resp1','input':delta}))
        self.assertTrue(known_bailian_continuation_error(500,{'code':'InvalidParameter','message':"'str' object has no attribute 'get'"}))
        self.assertFalse(known_bailian_continuation_error(500,{'code':'Other','message':"'str' object has no attribute 'get'"}))
        self.assertFalse(known_bailian_continuation_error(400,{'code':'InvalidParameter','message':"'str' object has no attribute 'get'"}))

    def test_gateway_recovers_known_500_without_changing_model_or_tools(self):
        import http.server
        import threading
        import urllib.parse
        source=Path(__file__).with_name('gateway.py');tree=ast.parse(source.read_text())
        nodes=[n for n in tree.body if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name in ('validate_request','Handler')]
        history=ResponseHistory();events=[];sent=[]
        replies=[(200,{'id':'resp1','status':'completed','output':[{'type':'function_call','id':'msg1','call_id':'call1','name':'run_code','arguments':'{}'}]}),
                 (500,{'code':'InvalidParameter','message':"'str' object has no attribute 'get'"}),
                 (200,{'id':'resp2','status':'completed','output':[{'type':'message','role':'assistant','content':[]} ]})]
        class FakeResponse:
            def __init__(self,status,payload):self.status=status;self.body=json.dumps(payload).encode()
            def getheaders(self):return [('Content-Type','application/json')]
            def getheader(self,key):return 'application/json' if key=='Content-Type' else None
            def read(self,*_args):out=self.body;self.body=b'';return out
            def read1(self,*_args):return self.read()
        class FakeConnection:
            def __init__(self,*_args,**_kwargs):pass
            def request(self,method,path,body=None,headers=None):sent.append(json.loads(body))
            def getresponse(self):return FakeResponse(*replies.pop(0))
            def close(self):pass
        fakehttp=SimpleNamespace(client=SimpleNamespace(HTTPSConnection=FakeConnection))
        namespace={'BaseHTTPRequestHandler':http.server.BaseHTTPRequestHandler,'POLICY':{'host':'provider.test','base_path':'/v1',
                   'model':'model','api_key':'secret','agent_token':'trial-token','reasoning_effort':'max'},
                   'IDS':set(),'ITEM_IDS':set(),'LOCK':threading.Lock(),'SLOTS':threading.BoundedSemaphore(8),
                   'FIELDS':set('model input tools reasoning store previous_response_id'.split()),
                   'HISTORY':history,'known_bailian_continuation_error':known_bailian_continuation_error,
                   'audit':lambda kind,**fields:events.append({'kind':kind,**fields}),
                   'http':fakehttp,'ssl':SimpleNamespace(create_default_context=lambda:None),
                   'json':json,'hashlib':__import__('hashlib'),'uuid':__import__('uuid'),
                   'urlsplit':urllib.parse.urlsplit,'unquote':urllib.parse.unquote,'parse_qsl':urllib.parse.parse_qsl}
        exec(compile(ast.Module(body=nodes,type_ignores=[]),str(source),'exec'),namespace)
        handler_type=namespace['Handler']
        def invoke(data):
            body=json.dumps(data).encode();handler=object.__new__(handler_type)
            handler.headers={'Host':'provider.test','Authorization':'Bearer trial-token','Content-Length':str(len(body)),
                             'Content-Type':'application/json','x-dashscope-session-cache':'enable'}
            handler.rfile=io.BytesIO(body);handler.wfile=io.BytesIO();handler.command='POST';handler.path='/v1/responses'
            statuses=[];handler.send_response=lambda code:statuses.append(code)
            handler.send_header=lambda *_:None;handler.end_headers=lambda:None
            handler.handle_request();return statuses,handler.wfile.getvalue()
        tools=[{'type':'function','name':'run_code','parameters':{'type':'object'}}]
        first={'model':'model','input':[{'role':'user','content':'hello'}],'tools':tools,'reasoning':{'effort':'max'},'store':True}
        self.assertEqual(invoke(first)[0],[200])
        second={**first,'previous_response_id':'resp1','input':[{'type':'function_call_output','call_id':'call1','output':'ok'}]}
        self.assertEqual(invoke(second)[0],[200])
        self.assertEqual(len(sent),3)
        self.assertNotIn('previous_response_id',sent[-1])
        self.assertEqual(sent[-1]['input'],first['input']+[{'type':'function_call','id':'msg1','call_id':'call1','name':'run_code','arguments':'{}'}]+second['input'])
        self.assertEqual(sent[-1]['tools'],tools)
        self.assertEqual(sent[-1]['reasoning'],{'effort':'max'})
        self.assertEqual(sum(e['kind']=='fallback' for e in events),1)
        replies.append((500,{'code':'OtherFailure','message':'unrelated'}))
        third={**first,'previous_response_id':'resp2','input':[{'role':'user','content':'continue'}]}
        before=len(sent)
        status,body=invoke(third)
        self.assertEqual(status,[500])
        self.assertEqual(json.loads(body)['code'],'OtherFailure')
        self.assertEqual(len(sent),before+1)
    def test_distinct_subnets_for_concurrent_tasks(self):
        with patch.object(security, '_subnets', {}):
            values = [security.subnet_octet(f'trial-{i}') for i in range(113)]
            self.assertEqual(len(set(values)), 113)
            self.assertEqual(security.subnet_octet('trial-0'), values[0])
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
                return SimpleNamespace(exception_info=None)
            async def create(cls, _config):
                obj = object.__new__(cls)
                obj._remaining_trial_configs = [SimpleNamespace(task=SimpleNamespace(path=root / n), trial_name=n) for n in ['hard', 'easy']]
                obj._trial_queue = SimpleNamespace(submit=submit)
                return obj
            async def run(obj):
                await obj._run_trials_with_queue()
                return SimpleNamespace(stats=SimpleNamespace(n_errored_trials=0))
            def audit(_root, _job, trial=None):
                return {'review_required': 0, 'trials': [{'trial': trial, 'status': 'verified'}]}
            with patch.object(runner.Job, 'create', classmethod(create)), patch.object(runner.Job, 'run', run), patch.object(runner, 'audit_job', side_effect=audit):
                self.assertEqual(asyncio.run(runner.execute(root, file)), 0)
                with self.assertRaisesRegex(ValueError, 'already attempted'):
                    asyncio.run(runner.execute(root, file))
            self.assertEqual(seen, ['hard', 'easy'])

    def test_gateway_preserves_bailian_cache_header(self):
        source = Path(__file__).with_name('gateway.py')
        tree = ast.parse(source.read_text())
        expression = next(n.value for n in ast.walk(tree) if isinstance(n, ast.Assign) and isinstance(n.value, ast.DictComp)
                          and any(isinstance(t, ast.Name) and t.id == 'headers' for t in n.targets))
        headers = {'Content-Type': 'application/json', 'x-dashscope-session-cache': 'enable', 'Authorization': 'secret'}
        forwarded = eval(compile(ast.Expression(expression), str(source), 'eval'), {'self': SimpleNamespace(headers=headers)})
        self.assertEqual(forwarded.get('x-dashscope-session-cache'), 'enable')
        self.assertNotIn('Authorization', forwarded)

    def test_only_unscored_errors_can_be_retried_once(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); (root / 'attempts').mkdir(); job = root / 'jobs/run/trial'; job.mkdir(parents=True)
            original = root / 'attempts/test.json'
            original.write_text(json.dumps({'task':'test', 'job':'run', 'trial':'trial'}))
            detail = {'config': {'task': {'path': '/tasks/test'}}, 'exception_info': {'exception_type':'RuntimeError'}, 'verifier_result': None}
            (job / 'result.json').write_text(json.dumps(detail))
            self.assertEqual(runner.claim_path(root, 'test', True).name, 'test.retry.json')
            detail['exception_info'] = None
            (job / 'result.json').write_text(json.dumps(detail))
            with self.assertRaisesRegex(ValueError, 'Only unscored'):
                runner.claim_path(root, 'test', True)
            detail['exception_info'] = {'exception_type':'RuntimeError'}
            (job / 'result.json').write_text(json.dumps(detail))
            (root / 'attempts/test.retry.json').write_text('{}')
            with self.assertRaisesRegex(ValueError, 'already attempted'):
                runner.claim_path(root, 'test', True)

    def test_two_workers_stop_after_an_error(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); (root / 'jobs/once').mkdir(parents=True)
            config = {'job_name':'once','jobs_dir':str(root/'jobs'),'n_concurrent_trials':2,'n_attempts':1,
                      'retry':{'max_retries':0},'tasks':[{'path':str(root/n)} for n in ('hard','easy','next')]}
            file = root/'config.json'; file.write_text(json.dumps(config)); started=[]; active=0; maximum=0
            async def submit(trial):
                nonlocal active, maximum
                started.append(trial.trial_name); active += 1; maximum = max(active, maximum)
                await asyncio.sleep(.01)
                active -= 1
                return SimpleNamespace(exception_info=SimpleNamespace(exception_type='RuntimeError') if trial.trial_name=='hard' else None)
            async def create(cls, _config):
                obj=object.__new__(cls)
                obj._remaining_trial_configs=[SimpleNamespace(task=SimpleNamespace(path=root/n),trial_name=n) for n in ('hard','easy','next')]
                obj._trial_queue=SimpleNamespace(submit=submit)
                return obj
            async def run(obj):
                await obj._run_trials_with_queue()
                return SimpleNamespace(stats=SimpleNamespace(n_errored_trials=1))
            def audit(_root,_job,trial=None):
                return {'review_required':int(trial=='hard'), 'trials':[{'trial':trial,'status':'review-required' if trial=='hard' else 'verified'}]}
            with patch.object(runner.Job,'create',classmethod(create)), patch.object(runner.Job,'run',run), patch.object(runner,'audit_job',side_effect=audit),patch.object(runner,'clear_error_for_retry'):
                self.assertEqual(asyncio.run(runner.execute(root,file)),1)
            self.assertEqual(started,['hard','easy','hard'])
            self.assertEqual(maximum,2)
            self.assertFalse((root/'attempts/next.json').exists())

    def test_error_cleanup_retains_aggregate_and_creates_single_retry(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'attempts').mkdir();(root/'config').mkdir();(root/'tmp').mkdir()
            (root/'config/monitor.json').write_text(json.dumps({'pricing':PRICING}))
            job=root/'jobs/once';trial_dir=job/'trial';ledger=trial_dir/'gateway-audit';ledger.mkdir(parents=True)
            (root/'attempts/task.json').write_text(json.dumps({'task':'task','job':'once','trial':'trial'}))
            (trial_dir/'result.json').write_text(json.dumps({'config':{'task':{'path':'/tasks/task'}},
                'exception_info':{'exception_type':'RuntimeError'},'verifier_result':None}))
            events=[{'kind':'request','id':'a','method':'POST','at':1793145600},
                    {'kind':'response','id':'a','status':200,'at':1793145601,
                     'usage':{'input_tokens':100,'input_tokens_details':{'cached_tokens':50},'output_tokens':10}}]
            (ledger/'requests.jsonl').write_text('\n'.join(map(json.dumps,events)))
            runner.clear_error_for_retry(root,job,SimpleNamespace(task=SimpleNamespace(path='/tasks/task'),trial_name='trial'))
            self.assertFalse(trial_dir.exists())
            self.assertTrue((root/'attempts/task.retry.json').exists())
            self.assertEqual(json.loads((root/'config/cleared-spend.json').read_text())['usage']['tokens'],110)
            with self.assertRaisesRegex(ValueError,'already attempted'):
                runner.claim_path(root,'task',True)

    def test_two_workers_keep_fixed_order_across_batches(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'jobs/once').mkdir(parents=True)
            names=('hard1','easy1','hard2','easy2')
            config={'job_name':'once','jobs_dir':str(root/'jobs'),'n_concurrent_trials':2,'n_attempts':1,
                    'retry':{'max_retries':0},'tasks':[{'path':str(root/n)} for n in names]}
            file=root/'config.json';file.write_text(json.dumps(config));started=[];active=0;maximum=0
            async def submit(trial):
                nonlocal active,maximum
                started.append(trial.trial_name);active+=1;maximum=max(maximum,active)
                await asyncio.sleep(.01);active-=1
                return SimpleNamespace(exception_info=None)
            async def create(cls,_config):
                obj=object.__new__(cls);obj._remaining_trial_configs=[SimpleNamespace(task=SimpleNamespace(path=root/n),trial_name=n) for n in names]
                obj._trial_queue=SimpleNamespace(submit=submit);return obj
            async def run(obj):
                await obj._run_trials_with_queue();return SimpleNamespace(stats=SimpleNamespace(n_errored_trials=0))
            async def prune():
                self.assertEqual(active,0)
            def audit(_root,_job,trial=None):
                return {'review_required':0,'trials':[{'trial':trial,'status':'verified'}]}
            with patch.object(runner.Job,'create',classmethod(create)),patch.object(runner.Job,'run',run),patch.object(runner,'audit_job',side_effect=audit),patch.object(runner,'prune_images',prune):
                self.assertEqual(asyncio.run(runner.execute(root,file)),0)
            self.assertEqual(started,list(names));self.assertEqual(maximum,2)

    def test_unscored_errors_do_not_become_zero_percent(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); (root/'config').mkdir(); (root/'attempts').mkdir();
            (root/'config/order.json').write_text(json.dumps({'tasks':[{'id':'test','position':1}]}))
            job=root/'jobs/one';trial=job/'trial';trial.mkdir(parents=True)
            (job/'config.json').write_text(json.dumps({'tasks':[{'path':'/tasks/test'}]}))
            config={'task':{'path':'/tasks/test'}}
            (trial/'config.json').write_text(json.dumps(config))
            (trial/'result.json').write_text(json.dumps({'config':config,'finished_at':'2026-10-28T08:00:00Z',
                                                        'exception_info':{'exception_type':'RuntimeError'}}))
            data=monitor.snapshot(root)
            self.assertEqual(data['completed'],1)
            self.assertEqual(data['verified'],0)
            self.assertIsNone(data['pass_rate'])
            job2=root/'jobs/two'; trial2=job2/'trial2'; trial2.mkdir(parents=True)
            (job2/'config.json').write_text(json.dumps({'tasks':[{'path':'/tasks/test'}]}))
            (trial2/'config.json').write_text(json.dumps(config))
            (trial2/'result.json').write_text(json.dumps({'config':config,'started_at':'2026-10-28T08:01:00Z',
                 'finished_at':'2026-10-28T08:03:00Z','verifier_result':{'rewards':{'reward':1}}}))
            (job2/'audit.json').write_text(json.dumps({'trials':[{'trial':'trial2','accepted_reward':1,'flags':[]}]}))
            data=monitor.snapshot(root)
            self.assertEqual((data['verified'],data['passes'],data['pass_rate']),(1,1,1))
            self.assertEqual(len(data['rows']),1)
            self.assertEqual(len(data['superseded']),1)


if __name__ == '__main__':
    unittest.main()
