param([Parameter(Mandatory=$true)][string]$DataDir)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$framework = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
$references = @('System.dll', 'System.Core.dll', 'System.Drawing.dll', 'System.Web.Extensions.dll') | ForEach-Object { Join-Path $framework $_ }
$references += Join-Path $framework 'WPF\WindowsBase.dll'
$references += Join-Path $framework 'WPF\UIAutomationClient.dll'
$references += Join-Path $framework 'WPF\UIAutomationTypes.dll'
try {
  $source = if ($PSScriptRoot) { $PSScriptRoot } else { $env:OPENCU_HELPER_SOURCE }
  Add-Type -Path @((Join-Path $source 'OpenCU.cs'), (Join-Path $source 'Activity.cs')) -ReferencedAssemblies $references
  [OpenCU.Native]::Run($DataDir)
  exit [Environment]::ExitCode
} catch {
  [Console]::Error.WriteLine($_.Exception.ToString())
  exit 2
}
