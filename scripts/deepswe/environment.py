"""Keep the task image cache bounded on the dedicated evaluation Docker daemon."""
import asyncio
import json
import os
from pathlib import Path
import shutil

from pier.environments.docker.docker import DockerEnvironment
from security import prepare_gateway


class EvaluationDockerEnvironment(DockerEnvironment):
    def _prepare_egress_proxy_compose(self):
        if not self.network_allowlist.domains:
            return
        if self.task_env_config.allow_internet:
            raise RuntimeError('Evaluation tasks must not have public network access')
        self._egress_proxy_compose_path = prepare_gateway(
            self.trial_paths.trial_dir, Path(os.environ['OMD_EVAL_BUNDLE']), self.session_id)

    def agent_process_env(self, env):
        return {**(env or {}), 'HTTP_PROXY': '', 'HTTPS_PROXY': '', 'http_proxy': '', 'https_proxy': '',
                'NO_PROXY': '*', 'no_proxy': '*', 'NODE_EXTRA_CA_CERTS': '/opt/omd/eval-ca.crt',
                'SSL_CERT_FILE': '/opt/omd/eval-ca.crt', 'REQUESTS_CA_BUNDLE': '/opt/omd/eval-ca.crt'}

    async def stop(self, delete):
        # Retain the current task image for the pristine verifier and reruns.
        # The next task's start() evicts old task images without forced pruning.
        await self.prepare_logs_for_host()
        await self._run_docker_compose_command(['down', '--volumes', '--remove-orphans'])
        shutil.rmtree(self.trial_paths.trial_dir / 'gateway-private', ignore_errors=True)
        # A separate verifier is locally built from tests/Dockerfile. Its image
        # must not pin every previous task's base layers in the small VM cache.
        if not self.task_env_config.docker_image:
            child = await asyncio.create_subprocess_exec('docker', 'image', 'rm', self._env_vars.main_image_name,
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            await child.wait()
            # BuildKit otherwise retains old verifier base layers even after
            # their image tags are removed. This daemon belongs only to evals.
            child = await asyncio.create_subprocess_exec('docker', 'buildx', 'prune', '--force', '--max-used-space', '8GB',
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            await child.wait()

    async def start(self, force_build):
        if os.environ.get('OMD_DEEPSWE_MANAGED_DOCKER') != '1':
            raise RuntimeError('Use the dedicated evaluation Docker daemon')
        current = self.task_env_config.docker_image
        process = await asyncio.create_subprocess_exec(
            'docker', 'image', 'ls', '--format', '{{.Repository}}:{{.Tag}}',
            stdout=asyncio.subprocess.PIPE,
        )
        stdout, _ = await process.communicate()
        # Never force-remove a referenced image or prune unrelated Docker data.
        for name in set(stdout.decode().splitlines()):
            if current and name.startswith('public.ecr.aws/d3j8x8q7/swe-bench-202605:') and name != current:
                child = await asyncio.create_subprocess_exec('docker', 'image', 'rm', name,
                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                await child.wait()
        await super().start(force_build)
        if current:
            process = await asyncio.create_subprocess_exec('docker', 'image', 'inspect', current,
                '--format', '{{json .RepoDigests}}', stdout=asyncio.subprocess.PIPE)
            stdout, _ = await process.communicate()
            if process.returncode == 0:
                digests = json.loads(stdout)
                expected = next(row for row in json.loads(Path(os.environ['OMD_EVAL_IMAGES']).read_text()) if row['image'] == current)
                repository = current.rsplit(':', 1)[0]
                if repository + '@' + expected['digest'] not in digests:
                    raise RuntimeError('Task image differs from the captured registry manifest: ' + current)
                (self.trial_paths.trial_dir / 'image-digest.json').write_text(
                    json.dumps({'image': current, 'digests': digests}, indent=2))
