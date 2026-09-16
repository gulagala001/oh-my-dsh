Execute a PowerShell command and return its stdout and stderr.

- Each call starts a fresh `pwsh` process. Pass `workdir`; variables, functions, and working-directory changes do not persist. Use native Windows paths and `$env:NAME` for environment variables.
- Read the managed `$env:DSH_*` values when you need the current execution environment. Long output is truncated; use the returned file path for the full output when one is provided.
- A nonzero exit is reported as `[exit code: N]`. After an interruption, a bare exit code 1 may mean the process was killed rather than the command failed.
- In the read-only Windows sandbox, PowerShell uses ConstrainedLanguage. Prefer cmdlets and core types; unsupported .NET calls, `Add-Type`, COM, and reflection fail. Workspace-write uses FullLanguage unless the host states otherwise.
- In confined modes, subprocess pipe capture can fail with EPERM. PowerShell pipelines are unaffected. Use the documented supported stdio modes when the task permits, without widening the operation's access.
- Treat a sandbox denial as a permission boundary. If approval is enabled, retry the exact denied command once with the narrowest sufficient `sandbox_permissions` and a concrete `justification`. If approval is disabled or rejected, do not bypass it. Do not request wider permissions speculatively.
