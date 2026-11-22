param(
    [Parameter(Mandatory=$true)][string]$Installer,
    [Parameter(Mandatory=$true)][string]$Archive
)
$ErrorActionPreference = 'Stop'
$root = New-Item -ItemType Directory -Path (Join-Path $env:RUNNER_TEMP ('omd-headless-' + [guid]::NewGuid().ToString()))
$app = Join-Path $root.FullName 'application'
$env:DSH_HOME = Join-Path $root.FullName 'dsh-home'
$cli = Join-Path $app 'resources/runtime/cli/bin/dsh.cmd'
$asar = Join-Path $app 'resources/app.asar'
try {
    $setup = Start-Process -FilePath $Installer -ArgumentList "/S /D=$app" -PassThru -Wait
    if ($setup.ExitCode -ne 0 -or !(Test-Path -LiteralPath $cli)) { throw "Official installer failed ($($setup.ExitCode))" }
    $digest = (Get-FileHash $asar).Hash
    $version = & $cli --version
    if ($LASTEXITCODE -ne 0 -or $version -ne '0.2.2-rc.5') { throw 'Unexpected Windows DSH CLI version' }
    & $cli --profile omd-unharnessed --from-default-profile headless --dump-config > (Join-Path $root.FullName 'profile.log')
    if ($LASTEXITCODE -ne 0) { throw 'The official CLI could not create the headless profile' }
    $uri = "file:$Archive"
    & $cli plugin --profile omd-unharnessed add $uri --ignore-scripts --yes
    if ($LASTEXITCODE -ne 0) { throw 'The official CLI could not install the package' }
    node (Join-Path $PSScriptRoot 'check-headless.mjs') $cli $root.FullName
    if ($LASTEXITCODE -ne 0) { throw 'Native headless calls did not pass' }
    if ((Get-FileHash $asar).Hash -ne $digest) { throw 'The application archive changed' }
} finally {
    $owners = @(Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -and $_.CommandLine.Contains($root.FullName) -and
        ($_.Name -in @('DeepSeek Harness.exe', 'python.exe', 'python3.exe', 'cmd.exe'))
    })
    foreach ($entry in $owners) {
        $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($entry.ProcessId)"
        if ($current -and $current.CreationDate -eq $entry.CreationDate -and $current.CommandLine -eq $entry.CommandLine) {
            Stop-Process -Id $entry.ProcessId -ErrorAction SilentlyContinue
        }
    }
    $uninstaller = if (Test-Path -LiteralPath $app) { Get-ChildItem -LiteralPath $app -Filter 'Uninstall*.exe' -File | Select-Object -First 1 }
    if ($uninstaller) {
        $remove = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -PassThru -Wait
        if ($remove.ExitCode -ne 0) { throw 'Could not uninstall the isolated Windows host' }
    }
    if ($owners.Count) { throw 'Headless test left a temporary process running' }
}
