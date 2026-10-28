"""Evaluation-only TLS gateway. Runs outside the untrusted agent container."""
import hashlib
import http.client
import json
import re
import ssl
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

POLICY = json.loads(Path('/policy/policy.json').read_text())
LOCK = threading.Lock()
IDS = set()
ITEM_IDS = set()
SLOTS = threading.BoundedSemaphore(8)
FIELDS = set('model input instructions tools tool_choice parallel_tool_calls reasoning max_output_tokens temperature top_p text truncation store stream previous_response_id metadata include service_tier user safety_identifier prompt_cache_key prompt_cache_retention'.split())


def audit(kind, **data):
    with LOCK:
        with open('/audit/requests.jsonl', 'a') as out:
            out.write(json.dumps({'at': time.time(), 'kind': kind, **data}) + '\n')


def validate_request(method, path, body):
    uri = urlsplit(path)
    base = POLICY['base_path'].rstrip('/') + '/responses'
    if uri.scheme or uri.netloc or uri.fragment:
        raise ValueError('Only the configured inference path is allowed')
    if method == 'GET':
        if uri.query and parse_qsl(uri.query, keep_blank_values=True) != [('include[]', 'reasoning.encrypted_content')]:
            raise ValueError('Unsupported stored-response query')
        rid = unquote(uri.path.removeprefix(base + '/'))
        with LOCK:
            known = rid in IDS
        if not uri.path.startswith(base + '/') or not known:
            raise ValueError('Response ID is outside this trial')
        return None
    if method != 'POST' or uri.path != base or uri.query:
        raise ValueError('Endpoint is outside the evaluation inference allowlist')
    data = json.loads(body)
    if not isinstance(data, dict) or data.get('model') != POLICY['model']:
        raise ValueError('Model substitution is prohibited')
    if set(data) - FIELDS:
        raise ValueError('Unsupported inference fields')
    if any(not isinstance(tool, dict) or tool.get('type') != 'function' for tool in data.get('tools', [])):
        raise ValueError('Remote search, MCP, and hosted execution tools are prohibited')
    if any(tool.get('name') == 'run_code' for tool in data.get('tools', [])):
        reasoning = data.get('reasoning') or {}
        if not isinstance(reasoning, dict) or reasoning.get('effort') != POLICY['reasoning_effort']:
            raise ValueError('PTC reasoning configuration differs from the captured profile')
    choice = data.get('tool_choice')
    if isinstance(choice, dict) and choice.get('type') != 'function':
        raise ValueError('Remote tool selection is prohibited')
    if isinstance(choice, str) and choice not in {'auto', 'none', 'required'}:
        raise ValueError('Unsupported tool selection')
    if data.get('previous_response_id'):
        with LOCK:
            known = data['previous_response_id'] in IDS
        if not known:
            raise ValueError('Previous response belongs to a different trial')

    def local_inputs(value):
        if isinstance(value, list):
            for item in value:
                local_inputs(item)
        elif isinstance(value, dict):
            if value.get('type') == 'item_reference':
                with LOCK:
                    known = value.get('id') in ITEM_IDS
                if not known:
                    raise ValueError('Item reference is outside this trial')
            for key, item in value.items():
                if key in {'file_url', 'file_id'}:
                    raise ValueError('Remote files are prohibited')
                if key == 'image_url' and (not isinstance(item, str) or not item.startswith('data:')):
                    raise ValueError('Remote media fetches are prohibited')
                local_inputs(item)
    local_inputs(data.get('input'))
    return data


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_):
        pass

    def reject(self, reason):
        audit('blocked', method=self.command, path=self.path[:500], reason=reason)
        body = json.dumps({'error': {'message': reason, 'type': 'evaluation_policy'}}).encode()
        self.send_response(403)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(body)
        self.close_connection = True

    def handle_request(self):
        request_id = str(uuid.uuid4())
        try:
            if self.headers.get('Host', '').split(':')[0] != POLICY['host']:
                raise ValueError('Unconfigured inference host')
            if self.headers.get('Authorization') != 'Bearer ' + POLICY['agent_token']:
                raise ValueError('Invalid trial credential')
            if self.headers.get('Transfer-Encoding') or self.headers.get('Content-Encoding', 'identity') != 'identity':
                raise ValueError('Unsupported request encoding')
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 <= length <= 64 * 1024 * 1024:
                raise ValueError('Request size exceeds evaluation transport limit')
            body = self.rfile.read(length)
            if len(body) != length:
                raise ValueError('Incomplete request')
            data = validate_request(self.command, self.path, body)
        except (ValueError, TypeError, RecursionError) as error:
            self.reject(str(error))
            return
        if not SLOTS.acquire(timeout=30):
            self.reject('Inference concurrency limit reached')
            return
        connection = http.client.HTTPSConnection(POLICY['host'], timeout=330, context=ssl.create_default_context())
        try:
            headers = {key: value for key, value in self.headers.items()
                       if key.lower() in {'content-type', 'accept', 'user-agent', 'openai-beta'}}
            headers.update({'Authorization': 'Bearer ' + POLICY['api_key'], 'Accept-Encoding': 'identity'})
            audit('request', id=request_id, method=self.command, model=data.get('model') if data else None,
                  reasoning=data.get('reasoning') if data else None,
                  tools=[tool.get('name') for tool in data.get('tools', [])] if data else [],
                  body_sha256=hashlib.sha256(body).hexdigest(), previous_response_id=data.get('previous_response_id') if data else None)
            connection.request(self.command, self.path, body=body or None, headers=headers)
            response = connection.getresponse()
            self.send_response(response.status)
            for key, value in response.getheaders():
                if key.lower() in {'content-type', 'cache-control', 'retry-after', 'x-request-id'}:
                    self.send_header(key, value)
            self.send_header('Connection', 'close')
            self.end_headers()
            pending = b''
            usage = None
            response_id = None
            sse = 'text/event-stream' in (response.getheader('Content-Type') or '')

            def observe(obj):
                nonlocal usage, response_id
                value = obj.get('response', obj) if isinstance(obj, dict) else {}
                items = (value.get('output') or []) if isinstance(value, dict) else []
                if not isinstance(items, list):
                    items = []
                if isinstance(obj, dict) and isinstance(obj.get('item'), dict):
                    items = [*items, obj['item']]
                with LOCK:
                    ITEM_IDS.update(item['id'] for item in items if isinstance(item, dict) and isinstance(item.get('id'), str))
                if isinstance(value, dict) and isinstance(value.get('id'), str):
                    response_id = value['id']
                    with LOCK:
                        IDS.add(response_id)
                if isinstance(value, dict) and isinstance(value.get('usage'), dict):
                    usage = value['usage']

            while chunk := response.read1(65536):
                pending += chunk
                if sse:
                    while b'\n' in pending:
                        line, pending = pending.split(b'\n', 1)
                        if line.startswith(b'data:') and line[5:].strip() != b'[DONE]':
                            try:
                                observe(json.loads(line[5:]))
                            except (ValueError, RecursionError):
                                pass
                if len(pending) > 32 * 1024 * 1024:
                    raise RuntimeError('Oversized provider response record')
                self.wfile.write(chunk)
                self.wfile.flush()
            if not sse and pending:
                try:
                    observe(json.loads(pending))
                except (ValueError, RecursionError):
                    pass
            audit('response', id=request_id, status=response.status, response_id=response_id,
                  usage=usage if self.command == 'POST' else None)
        except Exception as error:
            audit('transport-error', id=request_id, error=type(error).__name__)
        finally:
            self.close_connection = True
            connection.close()
            SLOTS.release()

    do_GET = do_POST = do_DELETE = do_PUT = do_PATCH = do_CONNECT = do_HEAD = do_OPTIONS = handle_request


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        import sys
        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError, ssl.SSLError, TimeoutError)):
            return
        super().handle_error(request, client_address)

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(330)
        return TLS.wrap_socket(connection, server_side=True), address


TLS = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
TLS.load_cert_chain('/policy/cert.pem', '/policy/key.pem')
audit('policy', host=POLICY['host'], model=POLICY['model'], reasoning_effort=POLICY['reasoning_effort'], remote_tools=False, cross_trial_response_ids=False)
Server(('0.0.0.0', 443), Handler).serve_forever()
