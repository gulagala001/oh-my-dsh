"""Read-only loopback dashboard; publishes numeric receipts, never prompts or keys."""
import argparse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.request import urlopen

_cache = {}


def read(path, default=None):
    try:
        if path.is_symlink():
            return default
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def stamp(value):
    if isinstance(value, (float, int)):
        return value / 1000 if value > 1e11 else value
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return dt.replace(tzinfo=timezone.utc).timestamp() if not dt.tzinfo else dt.timestamp()


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0 else None


def usage(raw, native=False):
    if not isinstance(raw, dict):
        return None
    if native:
        uncached, output = number(raw.get('inputTokens')), number(raw.get('outputTokens'))
        total, cache = number(raw.get('totalTokens')), number(raw.get('cacheReadTokens'))
        inp = total - output if total is not None and output is not None else None
        if cache is None and inp is not None and uncached is not None and inp >= uncached:
            cache = inp - uncached
        if inp is None and cache is not None and uncached is not None:
            inp = cache + uncached
        reasoning = number(raw.get('reasoningTokens'))
    else:
        inp, output = number(raw.get('input_tokens')), number(raw.get('output_tokens'))
        cache = number((raw.get('input_tokens_details') or {}).get('cached_tokens'))
        reasoning = number((raw.get('output_tokens_details') or {}).get('reasoning_tokens'))
    if inp is None or output is None or inp < 0:
        return None
    if cache is not None and cache > inp:
        cache = None
    return {'input': inp, 'cached': cache, 'uncached': inp - cache if cache is not None else None,
            'output': output, 'reasoning': reasoning, 'tokens': inp + output}


def receipts(trial):
    ledger = trial / 'gateway-audit/requests.jsonl'
    native = not ledger.is_file()
    path = trial / 'agent/events.jsonl' if native else ledger
    try:
        if path.is_symlink():
            return [], 'unavailable'
        stat = path.stat()
    except OSError:
        return [], 'unavailable'
    key = (str(path), stat.st_mtime_ns, stat.st_size)
    if key in _cache:
        return _cache[key]
    requests, responses = {}, {}
    with path.open() as handle:
        for line in handle:
            try:
                item = json.loads(line)
            except ValueError:
                continue  # A live writer may not have finished the last line.
            if native:
                event = item.get('event') or {}
                data = event.get('data') or {}
                if event.get('type') != 'assistant/message' or not data.get('usage'):
                    continue
                ident = str((item.get('sessionId'), data.get('turn'), data.get('step')))
                requests[ident] = {'at': stamp(item.get('at'))}
                responses[ident] = {'at': stamp(item.get('at')), 'usage': usage(data['usage'], True), 'status': 200}
            elif item.get('kind') == 'request' and item.get('method') == 'POST':
                requests[item['id']] = {'at': stamp(item.get('at'))}
            elif item.get('kind') == 'response':
                responses[item['id']] = {'at': stamp(item.get('at')), 'usage': usage(item.get('usage')), 'status': item.get('status')}
    rows = []
    for ident, request in requests.items():
        response = responses.get(ident, {})
        rows.append({'at': request['at'], 'finished': response.get('at'), 'usage': response.get('usage'),
                     'http_status': response.get('status')})
    # Discard previous versions of this file, not other completed trials.
    for old in list(_cache):
        if old[0] == str(path):
            del _cache[old]
    result = sorted(rows, key=lambda r: r['at'] or 0), 'native-history' if native else 'gateway'
    _cache[key] = result
    return result


def priced(call, pricing):
    measured = call['usage']
    if not measured:
        return None
    beijing_hour = ((call['at'] or 0) / 3600 + 8) % 24
    rates = pricing['bailian']['peak' if 8 <= beijing_hour < 22 else 'off_peak']
    def bounds(rate):
        inp, cache, out = measured['input'], measured['cached'], measured['output']
        if cache is None:
            return [(inp * rate['cached'] + out * rate['output']) / 1e6,
                    (inp * rate['input'] + out * rate['output']) / 1e6]
        cost = ((inp - cache) * rate['input'] + cache * rate['cached'] + out * rate['output']) / 1e6
        return [cost, cost]
    return {'cny': bounds(rates), 'reference_usd': bounds(pricing['reference_peak_usd'])}


def aggregate(calls, pricing):
    data = {'calls': len(calls), 'measured': 0, 'input': 0, 'cached': 0, 'output': 0, 'reasoning': 0,
            'tokens': 0, 'cache_unknown': 0, 'reasoning_measured': 0, 'cny': [0., 0.], 'reference_usd': [0., 0.]}
    for call in calls:
        u = call['usage']
        if not u:
            continue
        data['measured'] += 1
        for k in ('input', 'output', 'tokens'):
            data[k] += u[k]
        data['cached'] += u['cached'] or 0
        data['cache_unknown'] += u['cached'] is None
        data['reasoning'] += u['reasoning'] or 0
        data['reasoning_measured'] += u['reasoning'] is not None
        cost = priced(call, pricing)
        for k in ('cny', 'reference_usd'):
            data[k] = [a + b for a, b in zip(data[k], cost[k])]
    data['missing'] = data['calls'] - data['measured']
    return data


def alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except (OSError, ValueError, TypeError):
        return False


def snapshot(root):
    root = Path(root)
    cfg = read(root / 'config/monitor.json') or read(Path(__file__).with_name('monitor-defaults.json'))
    order = read(root / 'config/order.json', {'tasks': []})
    rows, extra, calls = [], [], []
    schedule_map = {r['id']: r for r in order['tasks']}
    for scope in ('jobs', 'probe-jobs'):
        for job in sorted((root / scope).glob('*')):
            if not job.is_dir() or job.is_symlink():
                continue
            status = read(job / 'run-status.json', {})
            config = read(job / 'config.json', {})
            audit = read(job / 'audit.json', {})
            audit_rows = {r['trial']: r for r in audit.get('trials', [])}
            formal = scope == 'jobs' and bool(config.get('tasks')) and all(
                Path(t.get('path', '')).name in schedule_map for t in config['tasks'])
            is_running = status.get('status') == 'running' and alive(status.get('pid'))
            for trial in sorted(job.glob('*')):
                if not trial.is_dir() or trial.is_symlink() or not (trial / 'config.json').is_file():
                    continue
                detail = read(trial / 'result.json', {})
                tc = detail.get('config') or read(trial / 'config.json', {})
                name = Path((tc.get('task') or {}).get('path', '')).name
                receipt, source = receipts(trial)
                raw = (detail.get('verifier_result') or {}).get('rewards', {}).get('reward')
                verified = audit_rows.get(trial.name, {})
                accepted = verified.get('accepted_reward')
                start_at = stamp(detail.get('started_at')) or (receipt[0]['at'] if receipt else None)
                claim = read(root / 'attempts' / (name + '.json'), {})
                start_at = start_at or stamp(claim.get('started_at'))
                finished = stamp(detail.get('finished_at'))
                state = ('通过' if accepted == 1 else '未通过' if accepted == 0 else
                         '执行异常' if detail.get('exception_info') else '待审计' if finished else
                         '运行中' if is_running else '已中断')
                if not formal:
                    state = '合成验收' if scope == 'probe-jobs' else '已取消·未评分'
                item = {'id': name, 'job': job.name, 'trial': trial.name, 'status': state,
                        'position': schedule_map.get(name, {}).get('position'),
                        'difficulty': schedule_map.get(name, {}).get('difficulty', '—'),
                        'started_at': start_at, 'finished_at': finished,
                        'elapsed': max(0, (finished or time.time()) - start_at) if start_at else None,
                        'raw': raw, 'accepted': accepted, 'source': source,
                        'flags': verified.get('flags', []), 'usage': aggregate(receipt, cfg['pricing'])}
                (rows if formal else extra).append(item)
                for call in receipt:
                    calls.append({**call, 'task': name, 'formal': formal})
    rows.sort(key=lambda r: r['position'] or 999)
    seen = {row['id'] for row in rows}
    pending = [r for r in order['tasks'] if r['id'] not in seen]
    formal_calls = sorted([c for c in calls if c['formal']], key=lambda c: c['at'] or 0)
    historical_calls = [c for c in calls if not c['formal']]
    completed = [r for r in rows if r['finished_at'] or r['status'] == '已中断']
    passes = sum(r['accepted'] == 1 for r in completed)
    scored = sum(r['raw'] in (0, 1) for r in completed)
    trend, cost, tokens = [], 0., 0
    for call in formal_calls:
        price = priced(call, cfg['pricing'])
        if price:
            cost += price['cny'][1]
            tokens += call['usage']['tokens']
            trend.append({'at': call['finished'] or call['at'], 'cny': cost, 'tokens': tokens})
    outcomes, passed = [], 0
    for i, row in enumerate(sorted(completed, key=lambda r: r['finished_at'] or time.time()), 1):
        passed += row['accepted'] == 1
        outcomes.append({'n': i, 'rate': passed / i, 'task': row['id']})
    current = next((r for r in rows if r['status'] == '运行中'), None)
    totals = aggregate(formal_calls, cfg['pricing'])
    done_usage = [r['usage'] for r in completed]
    avg = sum(u['reference_usd'][1] for u in done_usage) / len(completed) if completed else None
    return {'service': 'omd-deepswe-monitor', 'root_id': root.name, 'generated_at': time.time(),
            'model': cfg['model'], 'baseline': cfg['baseline'], 'pricing': cfg['pricing'],
            'schedule_method': order.get('method'), 'total': len(order['tasks']), 'completed': len(completed),
            'scored': scored, 'passes': passes, 'pass_rate': passes / len(completed) if completed else None,
            'final_pass_rate': passes / len(order['tasks']) if len(completed) == len(order['tasks']) and completed else None,
            'coverage': len(completed) / len(order['tasks']) if order['tasks'] else 0,
            'current': current, 'usage': totals, 'history_usage': aggregate(historical_calls, cfg['pricing']),
            'average_completed_reference_usd': avg, 'trend': trend, 'outcomes': outcomes,
            'rows': rows, 'pending': pending, 'history': extra}


def serve(root, port):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.headers.get('Host') not in {f'127.0.0.1:{port}', f'localhost:{port}'}:
                self.send_error(403)
                return
            if self.path in ('/', '/index.html'):
                body = Path(__file__).with_name('dashboard.html').read_bytes()
                mime = 'text/html; charset=utf-8'
            elif self.path in ('/api/status', '/report.json'):
                body = json.dumps(snapshot(root), ensure_ascii=False).encode()
                mime = 'application/json; charset=utf-8'
            elif self.path == '/favicon.ico':
                self.send_response(204); self.end_headers(); return
            else:
                self.send_error(404); return
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'")
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def log_message(self, *_args):
            pass
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()


def start(root, port):
    url = f'http://127.0.0.1:{port}'
    def ready():
        try:
            with urlopen(url + '/api/status', timeout=2) as r:
                status = json.load(r)
            return status.get('service') == 'omd-deepswe-monitor' and status.get('root_id') == root.name
        except (OSError, ValueError):
            return False
    if ready():
        return url
    log = root / 'monitor.log'
    with log.open('ab') as handle:
        proc = subprocess.Popen([str(root / '.venv/bin/python'), str(Path(__file__).resolve()), str(root), '--port', str(port)],
                                stdout=handle, stderr=handle, stdin=subprocess.DEVNULL, start_new_session=True,
                                env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
    for _ in range(30):
        if ready():
            (root / 'monitor-process.json').write_text(json.dumps({'pid': proc.pid, 'url': url}))
            return url
        if proc.poll() is not None:
            break
        time.sleep(.1)
    raise RuntimeError('Monitor did not start; inspect monitor.log')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('root', type=Path)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    serve(args.root, args.port)
