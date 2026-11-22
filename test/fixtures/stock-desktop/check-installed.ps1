param(
    [Parameter(Mandatory=$true)][string]$Installer,
    [Parameter(Mandatory=$true)][string]$Archive
)
$ErrorActionPreference = 'Stop'
$root = New-Item -ItemType Directory -Path (Join-Path $env:RUNNER_TEMP ('omd-stock-' + [guid]::NewGuid().ToString()))
$application = Join-Path $root.FullName 'application'
$env:DSH_HOME = Join-Path $root.FullName 'dsh-home'
$electronData = Join-Path $root.FullName 'electron'
$exe = Join-Path $application 'DeepSeek Harness.exe'
$profile = Join-Path $env:DSH_HOME 'profiles/desktop/package.json'
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
try { $port = $listener.LocalEndpoint.Port } finally { $listener.Stop() }

function Run-Check([string]$Mode) {
    node (Join-Path $PSScriptRoot 'check-issue-94.mjs') $port $Mode $root.FullName
    if ($LASTEXITCODE -ne 0) { throw "Stock DSH check failed ($Mode)" }
}

function Stop-Stock($process) {
    if ($process.HasExited) { return }
    [void]$process.CloseMainWindow()
    if (!$process.WaitForExit(15000)) {
        taskkill.exe /PID $process.Id /T /F | Out-Null
        if (!$process.WaitForExit(10000)) { throw 'The isolated DSH process did not exit' }
    }
}

try {
    $setup = Start-Process -FilePath $Installer -ArgumentList "/S /D=$application" -PassThru -Wait
    if ($setup.ExitCode -ne 0 -or !(Test-Path -LiteralPath $exe)) { throw "Official installer failed ($($setup.ExitCode))" }
    $integrity = (Get-FileHash (Join-Path $application 'resources/app.asar')).Hash
    $arguments = @('--no-open', "--user-data-dir=$electronData", "--remote-debugging-port=$port", '--remote-debugging-address=127.0.0.1')
    $app = Start-Process -FilePath $exe -ArgumentList $arguments -PassThru
    try { Run-Check 'init' } finally { Stop-Stock $app }
    if (!(Test-Path -LiteralPath $profile)) { throw 'DSH did not initialize the isolated profile' }
    $cli = Join-Path $application 'resources/runtime/cli/bin/dsh.cmd'
    & $cli plugin --profile desktop add "file:$Archive" --ignore-scripts --yes
    if ($LASTEXITCODE -ne 0) { throw 'The official DSH CLI could not install the plugin' }
    $stdout = Join-Path $root.FullName 'desktop.out'
    $stderr = Join-Path $root.FullName 'desktop.err'
    $app = Start-Process -FilePath $exe -ArgumentList $arguments -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    try { Run-Check 'exercise' }
    catch {
        $logDirectory = Join-Path $electronData 'logs'
        for ($attempt = 0; $attempt -lt 10; $attempt++) {
            $crash = Get-ChildItem -LiteralPath $logDirectory -Filter 'crash-*.log' -File -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($crash) { break }
            Start-Sleep -Milliseconds 200
        }
        if ($crash) {
            Get-Content -LiteralPath $crash.FullName -TotalCount 65 |
                Where-Object { $_ -notmatch '(token=|authorization|cookie|api[-_ ]?key|password|https?://)' }
        }
        foreach ($log in @($stdout, $stderr)) {
            Get-Content -LiteralPath $log -Tail 80 | Where-Object {
                $_ -match '(opencu|managed.browser|panic|process exited|unhandled)' -and $_ -notmatch '(token=|authorization|cookie)'
            }
        }
        throw
    } finally { Stop-Stock $app }
    if ((Get-FileHash (Join-Path $application 'resources/app.asar')).Hash -ne $integrity) {
        throw 'The test changed the DSH desktop application'
    }
} finally {
    $uninstaller = if (Test-Path -LiteralPath $application) { Get-ChildItem -LiteralPath $application -Filter 'Uninstall*.exe' -File | Select-Object -First 1 }
    if ($uninstaller) {
        $remove = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -PassThru -Wait
        if ($remove.ExitCode -ne 0) { throw "The isolated DSH uninstall failed ($($remove.ExitCode))" }
    }
}
