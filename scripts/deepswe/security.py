"""Controller-owned transport policy and credential projection for evaluations."""
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tarfile
import tempfile
import threading
from urllib.parse import urlsplit

import yaml

_subnet_lock = threading.Lock()
_subnets = {}


def subnet_octet(session_id):
    """Avoid collisions between concurrent trials on the dedicated daemon."""
    with _subnet_lock:
        if session_id not in _subnets:
            first = int(hashlib.sha256(session_id.encode()).hexdigest()[:2], 16)
            used = set(_subnets.values())
            available = next((n for offset in range(256) if (n := (first + offset) % 256) not in used), None)
            if available is None:
                raise RuntimeError('No isolated inference subnets remain in this evaluation run')
            _subnets[session_id] = available
        return _subnets[session_id]


def prepare_gateway(trial_dir, bundle, session_id):
    private = trial_dir / 'gateway-private'
    private.mkdir(mode=0o700, exist_ok=True)
    os.chmod(private, 0o700)
    with tarfile.open(bundle / 'profile.tgz') as archive:
        patch = json.load(archive.extractfile('omd/home/profiles/eval/cordis.patch.yml'))
        credential = yaml.safe_load(archive.extractfile('omd/home/profiles/eval/.credentials.yaml'))
    manifest = json.loads((bundle / 'manifest.json').read_text())
    selected = manifest['selection']['model']
    provider = next(row for row in patch if row.get('id') == 'llm-pi-ai')['config']['providers'][selected['provider']]
    url = urlsplit(provider['baseURL'])
    if url.scheme != 'https' or url.port not in (None, 443) or url.query or url.username:
        raise ValueError('Evaluation transport requires an HTTPS inference endpoint on port 443')
    key = credential['refs'][provider['apiKeyEnv']]
    if not isinstance(key, str) or not key:
        raise ValueError('Selected API key reference is not a plain configured credential')
    policy = {'host': url.hostname, 'base_path': url.path, 'model': selected['model'],
              'reasoning_effort': selected.get('reasoningEffort'),
              'api_key': key, 'credential_ref': provider['apiKeyEnv'], 'agent_token': secrets.token_urlsafe(32)}
    (private / 'policy.json').write_text(json.dumps(policy))
    os.chmod(private / 'policy.json', 0o600)
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30',
                    '-keyout', str(private / 'key.pem'), '-out', str(private / 'cert.pem'),
                    '-subj', '/CN=' + url.hostname, '-addext', 'subjectAltName=DNS:' + url.hostname],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    audit = trial_dir / 'gateway-audit'
    audit.mkdir(mode=0o700, exist_ok=True)
    build = trial_dir / 'gateway-build'
    build.mkdir(exist_ok=True)
    shutil.copyfile(Path(__file__).with_name('gateway.py'), build / 'gateway.py')
    shutil.copyfile(Path(__file__).with_name('gateway_state.py'), build / 'gateway_state.py')
    image = os.environ.get('OMD_EVAL_PROXY_IMAGE', 'python:3.12-slim')
    (build / 'Dockerfile').write_text(f'FROM {image}\nCOPY gateway.py gateway_state.py /\nENV PYTHONDONTWRITEBYTECODE=1\nCMD ["python", "/gateway.py"]\n')
    octet = subnet_octet(session_id)
    subnet = f'172.29.{octet}'
    proxy = 'pier-egress-proxy'
    compose = {
        'services': {
            'main': {'networks': {'pier-egress-internal': {'ipv4_address': subnet + '.3'}},
                     'extra_hosts': {url.hostname: subnet + '.2'}, 'dns': ['127.0.0.1'],
                     'cap_drop': ['NET_RAW', 'NET_ADMIN'], 'security_opt': ['no-new-privileges:true'],
                     'depends_on': {proxy: {'condition': 'service_healthy'}}},
            proxy: {'build': {'context': str(build.resolve())},
                    'platform': os.environ.get('OMD_EVAL_PROXY_PLATFORM', 'linux/amd64'),
                    'user': f'{os.getuid()}:{os.getgid()}', 'read_only': True, 'tmpfs': ['/tmp'],
                    'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'],
                    'sysctls': {'net.ipv4.ip_unprivileged_port_start': '0'},
                    'volumes': [{'type': 'bind', 'source': str(private.resolve()), 'target': '/policy', 'read_only': True},
                                {'type': 'bind', 'source': str(audit.resolve()), 'target': '/audit'}],
                    'networks': {'pier-egress-internal': {'ipv4_address': subnet + '.2'}, 'default': {}},
                    'healthcheck': {'test': ['CMD', 'python', '-c',
                        'import socket,ssl; c=ssl._create_unverified_context().wrap_socket(socket.create_connection(("127.0.0.1",443),timeout=2),server_hostname="localhost"); c.close()'],
                        'interval': '2s', 'timeout': '3s', 'retries': 30}},
        },
        'networks': {'pier-egress-internal': {'internal': True,
            'driver_opts': {'com.docker.network.bridge.name': 'ev' + hashlib.sha256(session_id.encode()).hexdigest()[:10]},
            'ipam': {'config': [{'subnet': subnet + '.0/24'}]}}, 'default': {}},
    }
    path = trial_dir / 'docker-compose-inference-gateway.json'
    path.write_text(json.dumps(compose, indent=2))
    return path


def projected_profile(bundle, private, output):
    """Replace all account secrets with trial-only tokens before any upload."""
    policy = json.loads((private / 'policy.json').read_text())
    with tarfile.open(bundle / 'profile.tgz') as source, tarfile.open(output, 'w:gz') as target:
        original = yaml.safe_load(source.extractfile('omd/home/profiles/eval/.credentials.yaml').read())
        secrets_to_replace = [value for value in original.get('refs', {}).values() if isinstance(value, str) and len(value) >= 8]
        for member in source:
            if not member.isfile():
                target.addfile(member)
                continue
            data = source.extractfile(member).read()
            if member.name.endswith('/.credentials.yaml'):
                credentials = yaml.safe_load(data)
                credentials['refs'] = {key: policy['agent_token'] if key == policy['credential_ref'] else 'evaluation-unavailable'
                                       for key in credentials.get('refs', {})}
                credentials['records'] = {}
                data = json.dumps(credentials).encode()
            elif member.name.endswith('/.env'):
                # API references still resolve through the unchanged profile.
                data = b''
            for value in secrets_to_replace:
                replacement = policy['agent_token'] if value == policy['api_key'] else 'evaluation-unavailable'
                data = data.replace(value.encode(), replacement.encode())
            member.size = len(data)
            target.addfile(member, io.BytesIO(data))
        cert = (private / 'cert.pem').read_bytes()
        entry = tarfile.TarInfo('omd/eval-ca.crt')
        entry.size, entry.mode = len(cert), 0o644
        target.addfile(entry, io.BytesIO(cert))
