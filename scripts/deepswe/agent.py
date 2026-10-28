"""Pier adapter for an installed DSH + OMD profile snapshot.

The runtime and private profile are uploaded only to the agent container.
Pier keeps tests and the reference solution out of this environment, then grades
the committed patch in its own clean verifier container.
"""
import json
import os
from pathlib import Path
import tempfile

from pier.agents.base import BaseAgent
from pier.models.agent.network import NetworkAllowlist
from security import projected_profile


class OMDAgent(BaseAgent):
    @staticmethod
    def name():
        return "omd-ptc"

    def __init__(self, *args, bundle_dir=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.bundle = Path(bundle_dir or os.environ["OMD_EVAL_BUNDLE"]).resolve()
        self.manifest = json.loads((self.bundle / "manifest.json").read_text())
        configured = self.manifest["selection"]["model"]
        expected = f"{configured['provider']}/{configured['model']}"
        if self.model_name != expected:
            raise ValueError(f"The captured profile requires model {expected}")

    def version(self):
        return self.manifest["omd_version"]

    def network_allowlist(self):
        return NetworkAllowlist(domains=self.manifest["inference_domains"])

    async def setup(self, environment):
        await environment.upload_file((self.bundle / 'runtime-linux-amd64.tgz').resolve(), '/tmp/omd-runtime-linux-amd64.tgz')
        with tempfile.NamedTemporaryFile(dir=self.bundle.parent, suffix='.tgz') as projected:
            projected_profile(self.bundle, environment.trial_paths.trial_dir / 'gateway-private', Path(projected.name))
            await environment.upload_file(projected.name, '/tmp/omd-profile.tgz')
        result = await environment.exec(
            command="mkdir -p /opt /logs/agent && tar -xzf /tmp/omd-runtime-linux-amd64.tgz -C /opt && "
            "tar -xzf /tmp/omd-profile.tgz -C /opt && rm /tmp/omd-*.tgz && "
            "mkdir -p /opt/omd/home/profiles/eval && "
            "ln -s /opt/omd/runtime/node_modules /opt/omd/home/profiles/eval/node_modules && "
            "git config --global --add safe.directory /app && "
            "git -C /app config user.email eval@localhost && git -C /app config user.name 'OMD evaluation' && "
            "/opt/omd/bin/node --version",
            user="root", timeout_sec=600,
        )
        (self.logs_dir / 'setup.log').write_text((result.stdout or '') + (result.stderr or ''))
        if result.return_code:
            raise RuntimeError(f"OMD setup failed ({result.return_code}): {(result.stdout or '')[-2000:]} {result.stderr or ''}")

    async def run(self, instruction, environment, context):
        # This file contains only the public task prompt, never tests or solution.
        prompt_file = self.logs_dir / "instruction.md"
        prompt_file.write_text(instruction)
        await environment.upload_file(prompt_file, "/opt/omd/instruction.md")
        try:
            result = await environment.exec(
                command="/opt/omd/bin/node /opt/omd/bridge.mjs > /logs/agent/bridge.log 2>&1",
                env=environment.agent_process_env({"NODE_USE_ENV_PROXY": "1"}),
                cwd="/app", user="root", timeout_sec=10900,
            )
            if result.return_code:
                raise RuntimeError(f"OMD exited with {result.return_code}; see agent/bridge.log and host.log")
        finally:
            await environment.download_dir("/logs/agent", self.logs_dir)
            summary = self.logs_dir / "summary.json"
            if summary.exists():
                data = json.loads(summary.read_text())
                context.metadata = data
                # Preserve unknown measurements; cache buckets are not assumed
                # to be zero and input includes cache according to Pier's schema.
                groups = list(data.get('usage', {}).get('metrics', {}).values())
                if not groups:
                    groups = [data.get('snapshot', {}).get('metrics', {}).get('main') or {}]
                    context.metadata['token_coverage'] = 'main-session'
                else:
                    context.metadata['token_coverage'] = 'all-reported-calls'
                for target, source, missing in [('n_input_tokens', 'inputTotalTokens', 'inputUnreported'),
                                                ('n_output_tokens', 'outputTokens', 'outputUnreported'),
                                                ('n_cache_tokens', 'cacheReadTokens', 'cacheUnreported')]:
                    if all(isinstance(g.get(source), (int, float)) and not g.get(missing) for g in groups):
                        setattr(context, target, int(sum(g[source] for g in groups)))
                peaks = [g['peakContext'] for g in groups if isinstance(g.get('peakContext'), (int, float))]
                if peaks:
                    context.peak_context_tokens = int(max(peaks))
                context.n_agent_steps = data.get('modelCalls')
