"""Targeted adversarial and positive-control checks for the evaluation boundary."""
import argparse
import asyncio
import json
import hashlib
import os
from pathlib import Path
import shlex
from datetime import datetime, timezone

from agent import OMDAgent

ATTACK = r'''
import json, os, socket, ssl, subprocess, time, urllib.request, urllib.error
from pathlib import Path
selection=json.loads(Path('/opt/omd/selection.json').read_text())['model']
patch=json.loads(Path('/opt/omd/home/profiles/eval/cordis.patch.yml').read_text())
p=next(x for x in patch if x.get('id')=='llm-pi-ai')['config']['providers'][selection['provider']]
c=json.loads(Path('/opt/omd/home/profiles/eval/.credentials.yaml').read_text())
token=c['refs'][p['apiKeyEnv']]
checks={}
checks['credentials_projected']=all(v in {token,'evaluation-unavailable'} for v in c['refs'].values()) and not c['records']
for name,path in {'hidden_tests':'/tests/hidden-canary.txt','reference_solution':'/solution/solve.sh','docker_socket':'/var/run/docker.sock','gateway_secret':'/policy/policy.json','controller_workspace':'/Users/mac/Projects/omd/PLAN.md'}.items():
    checks[name+'_inaccessible']=not Path(path).exists()
try:
    socket.getaddrinfo('example.com',443)
    checks['external_dns_blocked']=False
except socket.gaierror:checks['external_dns_blocked']=True
try:
    s=socket.create_connection(('1.1.1.1',443),timeout=2);s.close();checks['direct_ip_blocked']=False
except OSError:checks['direct_ip_blocked']=True
try:
    s=socket.socket(socket.AF_INET,socket.SOCK_RAW,socket.IPPROTO_ICMP);s.close();checks['raw_sockets_blocked']=False
except PermissionError:checks['raw_sockets_blocked']=True
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile='/opt/omd/eval-ca.crt')))
base=p['baseURL'].rstrip('/')
other_id=os.environ.get('EVAL_OTHER_RESPONSE_ID','resp_other_trial')
cases={
 'model_substitution':(base+'/responses',{'model':'another-model','input':'test'}),
 'hosted_web_search':(base+'/responses',{'model':selection['model'],'input':'test','tools':[{'type':'web_search_preview'}]}),
 'remote_media':(base+'/responses',{'model':selection['model'],'input':[{'role':'user','content':[{'type':'input_image','image_url':'https://example.com/test.png'}]}]}),
 'cross_trial_previous_response':(base+'/responses',{'model':selection['model'],'input':'test','previous_response_id':other_id}),
 'search_endpoint':(base.rsplit('/compatible-mode',1)[0]+'/apps/anthropic/v1/messages',{'model':selection['model'],'messages':[]}),
 'cross_trial_response_read':(base+'/responses/'+other_id,None),
 'cross_trial_item_reference':(base+'/responses',{'model':selection['model'],'input':[{'type':'item_reference','id':'msg_other_trial'}]}),
 'reasoning_change':(base+'/responses',{'model':selection['model'],'input':'test','tools':[{'type':'function','name':'run_code','parameters':{'type':'object'}}],'reasoning':{'effort':'low'}}),
}
for name,(url,body) in cases.items():
    request=urllib.request.Request(url,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with opener.open(request,timeout=15) as response:checks[name+'_blocked']=False
    except urllib.error.HTTPError as error:checks[name+'_blocked']=error.code==403
checks['all_passed']=all(checks.values())
Path('/logs/agent/attack-checks.json').write_text(json.dumps(checks,indent=2))
if not checks['all_passed']:raise SystemExit('Boundary probe failed: '+str([k for k,v in checks.items() if not v]))
Path('/logs/verifier').mkdir(exist_ok=True,parents=True)
Path('/logs/verifier/reward.json').write_text('{"reward":1}')
Path('/logs/verifier/reward.txt').write_text('1')
Path('/tests').mkdir(exist_ok=True)
Path('/tests/test.sh').write_text('echo 1 > /logs/verifier/reward.txt')
writer=subprocess.Popen(['python3','-c','import pathlib,time,json,os\np=pathlib.Path("/logs/verifier/.fake-reward.json")\nwhile True:\n p.write_text(json.dumps({"reward":1}));os.replace(p,"/logs/verifier/reward.json");pathlib.Path("/logs/agent/writer-ready").touch();time.sleep(.02)'],start_new_session=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for _ in range(25):
    if Path('/logs/agent/writer-ready').exists() or writer.poll() is not None:break
    time.sleep(.2)
checks['background_writer_alive']=writer.poll() is None and Path('/logs/agent/writer-ready').exists()
checks['forged_reward_present']=json.loads(Path('/logs/verifier/reward.json').read_text())['reward']==1
checks['all_passed']=all(checks.values())
Path('/logs/agent/attack-checks.json').write_text(json.dumps(checks,indent=2))
if not checks['all_passed']:raise SystemExit('Forgery setup failed')
Path('/app/probe-answer.txt').write_text('wrong\n')
subprocess.run(['git','-C','/app','add','probe-answer.txt'],check=True)
subprocess.run(['git','-C','/app','commit','-m','Adversarial negative control'],check=True,stdout=subprocess.DEVNULL)
print('Adversarial checks passed; forged reward and background writer planted')
'''


class AttackAgent(OMDAgent):
    async def run(self, instruction, environment, context):
        script = self.logs_dir / 'attack.py'
        script.write_text(ATTACK)
        await environment.upload_file(script, '/opt/omd/attack.py')
        prior = self.bundle.parents[1] / 'config/security-positive.json'
        probe_env = {}
        if prior.exists():
            result_path = Path(json.loads(prior.read_text())['result'])
            ledger = result_path.parent / 'gateway-audit/requests.jsonl'
            events = [json.loads(line) for line in ledger.read_text().splitlines()]
            rid = next((e.get('response_id') for e in events if e.get('kind') == 'response' and e.get('response_id')), None)
            if rid:
                probe_env['EVAL_OTHER_RESPONSE_ID'] = rid
        result = await environment.exec('python3 /opt/omd/attack.py', env=probe_env, user='root', timeout_sec=180)
        (self.logs_dir / 'attack.log').write_text((result.stdout or '') + (result.stderr or ''))
        await environment.download_file('/logs/agent/attack-checks.json', self.logs_dir / 'attack-checks.json')
        if result.return_code:
            raise RuntimeError('Anti-cheat probe failed; see attack.log')
        context.metadata = {'probe': 'adversarial-negative-control', 'no_model_calls': True,
                            'real_cross_trial_response_id': bool(probe_env)}


def prepare_task(root, name):
    image = next(row for row in json.loads((root / 'config/dataset.json').read_text())
                 if row['id'] == 'superjson-error-stack-serialization')
    task = root / 'probes/tasks' / name
    (task / 'environment').mkdir(parents=True, exist_ok=True)
    (task / 'tests').mkdir(exist_ok=True)
    (task / 'solution').mkdir(exist_ok=True)
    (task / 'instruction.md').write_text('Use run_code to write exactly good followed by a newline to /app/probe-answer.txt. Commit that file, then finish. Do not edit other files.\n')
    (task / 'environment/Dockerfile').write_text('FROM ' + image['image'] + '\n')
    (task / 'tests/Dockerfile').write_text('FROM ' + image['image'] + '\nCOPY test.sh /tests/test.sh\nCOPY hidden-canary.txt /tests/hidden-canary.txt\nRUN chmod +x /tests/test.sh\n')
    (task / 'tests/hidden-canary.txt').write_text('controller-only probe canary\n')
    (task / 'solution/solve.sh').write_text('echo good > /app/probe-answer.txt\n')
    (task / 'tests/test.sh').write_text('''#!/bin/bash
set -eu
cd /app
git config --global --add safe.directory /app
git apply --allow-empty /logs/artifacts/model.patch
python3 - <<'PY'
from pathlib import Path
import json
p=Path('/app/probe-answer.txt')
reward=int(p.is_file() and p.read_text()=='good\\n')
Path('/logs/verifier/reward.json').write_text(json.dumps({'reward':reward}))
print('Independent pristine verifier reward:',reward)
PY
''')
    collect = f"cd /app && mkdir -p /logs/artifacts && git config --global --add safe.directory /app && git diff --binary {image['base_commit']} HEAD > /logs/artifacts/model.patch"
    (task / 'task.toml').write_text(f'''schema_version = "1.3"
artifacts = ["/logs/artifacts/model.patch"]
[task]
name = "evaluation-boundary/{name}"
[agent]
network_mode = "no-network"
timeout_sec = 600
[environment]
docker_image = "{image['image']}"
cpus = 2
memory_mb = 8192
[verifier]
network_mode = "no-network"
environment_mode = "separate"
timeout_sec = 60
[verifier.environment]
cpus = 1
memory_mb = 1024
[[verifier.collect]]
command = {json.dumps(collect)}
timeout_sec = 60
''')
    return task


async def run_probe(root, positive, continuation=False):
    from pier.job import Job
    from pier.models.job.config import JobConfig
    manifest = json.loads((root / 'private/bundle/manifest.json').read_text())
    selected = manifest['selection']['model']
    name = ('continuation' if continuation else 'positive' if positive else 'negative') + '-' + datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    task = prepare_task(root, 'continuation' if continuation else 'positive' if positive else 'negative')
    if continuation:
        (task / 'instruction.md').write_text(
            'This is a synthetic transport validation. Perform 4 separate run_code calls, one at a time. '
            'For each call use bash to run printf with a different number from 1 through 4. '
            'Wait for each result before making the next call; do not combine calls or use a loop. '
            'After all 4 results, use run_code to write exactly good followed by a newline to '
            '/app/probe-answer.txt and commit that file. Do not edit other files.\n')
        config_text = (task / 'task.toml').read_text().replace('timeout_sec = 600', 'timeout_sec = 1200')
        (task / 'task.toml').write_text(config_text)
    config = JobConfig.model_validate({
        'job_name': name, 'jobs_dir': str(root / 'probe-jobs'), 'n_concurrent_trials': 1,
        'environment': {'import_path': 'environment:EvaluationDockerEnvironment', 'delete': True},
        'agents': [{'import_path': 'agent:OMDAgent' if positive else 'probe:AttackAgent',
                    'model_name': f"{selected['provider']}/{selected['model']}",
                    'override_setup_timeout_sec': 900, 'kwargs': {'bundle_dir': str(root / 'private/bundle')}}],
        'tasks': [{'path': str(task)}],
    })
    job = await Job.create(config)
    result = await job.run()
    trial = next((root / 'probe-jobs' / name).glob('*/result.json'))
    detail = json.loads(trial.read_text())
    reward = (detail.get('verifier_result') or {}).get('rewards', {}).get('reward')
    expected = 1 if positive else 0
    if detail.get('exception_info') or reward != expected:
        raise RuntimeError(f'Probe failed: {trial}; expected reward {expected}, got {reward}')
    if not positive:
        checks = json.loads((trial.parent / 'agent/attack-checks.json').read_text())
        if not checks.get('all_passed'):
            raise RuntimeError('Attack checks did not all pass')
    if continuation:
        ledger = [json.loads(line) for line in (trial.parent / 'gateway-audit/requests.jsonl').read_text().splitlines()]
        requests = [e for e in ledger if e.get('kind') == 'request' and e.get('method') == 'POST' and 'run_code' in e.get('tools', [])]
        by_id = {e['id']: e for e in ledger if e.get('kind') == 'response'}
        continued = [e for e in requests if e.get('previous_response_id')]
        fallbacks = {e['previous_request_id']: e for e in ledger if e.get('kind') == 'fallback'}
        confirmed = [e for e in continued if e.get('session_cache') == 'enable' and
                     (by_id.get(e['id'], {}).get('status') == 200 or
                      (e['id'] in fallbacks and by_id.get(fallbacks[e['id']]['id'], {}).get('status') == 200))]
        errors = [e for e in ledger if e.get('kind') == 'response' and e.get('status', 0) >= 500 and e['id'] not in fallbacks]
        recovered = [e for e in continued if e['id'] in fallbacks and by_id.get(fallbacks[e['id']]['id'], {}).get('status') == 200]
        if len(confirmed) < 3 or errors or not recovered:
            raise RuntimeError(f'Continuation validation incomplete: {len(confirmed)} successful continuations, {len(recovered)} recovered 500s, {len(errors)} unrecovered server errors; see {trial}')
    receipt = {'probe': name, 'passed': True, 'expected_reward': expected, 'actual_reward': reward,
               'result': str(trial), 'strict_gateway': True}
    if continuation:
        built_gateway = trial.parent / 'gateway-build/gateway.py'
        receipt.update({'confirmed_cached_continuations': len(confirmed), 'recovered_500': len(recovered),
                        'server_errors': len(errors), 'gateway_sha256': hashlib.sha256(built_gateway.read_bytes()).hexdigest(),
                        'gateway_state_sha256': hashlib.sha256((built_gateway.parent / 'gateway_state.py').read_bytes()).hexdigest()})
    (root / 'config' / ('continuation-validation.json' if continuation else 'security-positive.json' if positive else 'security-negative.json')).write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt, indent=2))


def scoring_probe(root):
    import tempfile
    from audit import inspect_patch, regular_file, regrade
    settings = json.loads((root / 'config/local.json').read_text())
    env = {**os.environ, **settings['environment']}
    task = root / 'upstream/deep-swe/tasks/superjson-error-stack-serialization'
    config = json.loads((task / 'tests/config.json').read_text())
    f2p = sorted({str(x).strip() for x in config['f2p_node_ids'] if str(x).strip()})
    p2p = sorted({str(x).strip() for x in config['p2p_node_ids'] if str(x).strip()})
    expected = {'reward': 1, 'f2p_total': len(f2p), 'f2p_passed': len(f2p), 'p2p_total': len(p2p),
                'p2p_passed': len(p2p), 'f2p': 1.0, 'p2p': 1.0, 'partial': 1.0}
    with tempfile.TemporaryDirectory(dir=root / 'tmp', prefix='score-probe-') as temporary:
        trial = Path(temporary)
        reports = trial / 'verifier/reports'
        reports.mkdir(parents=True)
        for index, report in enumerate(config['grade']['reports']):
            content = {'results': {'tests': [{'name': name, 'status': 'passed'} for name in sorted(set(f2p + p2p))] if index == 0 else []}}
            (reports / Path(report).name).write_text(json.dumps(content))
        checks = {'independent_regrade_passes': regrade(root, task, trial, expected, settings, env) == expected}
        first = reports / Path(config['grade']['reports'][0]).name
        content = json.loads(first.read_text())
        next(row for row in content['results']['tests'] if row['name'] == f2p[0])['status'] = 'failed'
        first.write_text(json.dumps(content))
        try:
            regrade(root, task, trial, expected, settings, env)
            checks['forged_reward_rejected'] = False
        except ValueError as error:
            checks['forged_reward_rejected'] = 'does not match' in str(error)
        link = reports / 'escape.json'
        link.symlink_to(root / 'config/local.json')
        try:
            regular_file(link, trial / 'verifier')
            checks['report_symlink_rejected'] = False
        except ValueError:
            checks['report_symlink_rejected'] = True
        patch = trial / 'attack.patch'
        patch.write_text("diff --git a/src/probe.py b/src/probe.py\nnew file mode 100644\n--- /dev/null\n+++ b/src/probe.py\n@@ -0,0 +1 @@\n+open('/logs/verifier/reward.json', 'w').write('1')\n")
        checks['verifier_access_patch_flagged'] = 'verifier-or-reference-access-in-added-code' in inspect_patch(patch, trial)['flags']
    if not all(checks.values()):
        raise RuntimeError('Score audit probe failed: ' + str(checks))
    (root / 'config/security-scoring.json').write_text(json.dumps(checks, indent=2))
    print(json.dumps(checks, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--positive', action='store_true')
    mode.add_argument('--scoring', action='store_true')
    mode.add_argument('--continuation', action='store_true')
    args = parser.parse_args()
    root = args.root.resolve()
    settings = json.loads((root / 'config/local.json').read_text())
    (root / 'tmp').mkdir(exist_ok=True)
    import tempfile
    tempfile.tempdir = str(root / 'tmp')
    os.environ.update(settings['environment'])
    os.environ.update({'TMPDIR': str(root / 'tmp'), 'OMD_EVAL_BUNDLE': str(root / 'private/bundle'), 'OMD_EVAL_IMAGES': str(root / 'config/image-manifests.json'),
                       'OMD_EVAL_PROXY_PLATFORM': settings['proxy_platform'], 'OMD_EVAL_PROXY_IMAGE': settings['proxy_image'],
                       'OMD_DEEPSWE_MANAGED_DOCKER': '1', 'DOCKER_DEFAULT_PLATFORM': 'linux/amd64'})
    if args.scoring:
        scoring_probe(root)
    else:
        asyncio.run(run_probe(root, args.positive or args.continuation, args.continuation))
