param([Parameter(Mandatory = $true)][string]$Installer)

$ErrorActionPreference = 'Stop'
$destination = Join-Path $env:LOCALAPPDATA 'OMD Desktop Preview Check'
$homePath = Join-Path $env:APPDATA 'oh-my-dsh-data'
$profilePath = Join-Path $homePath 'profiles/desktop/package.json'
$exe = Join-Path $destination 'Oh My DSH.exe'
if ((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath $homePath) -or $env:DSH_HOME -or $env:ELECTRON_RUN_AS_NODE) {
    throw 'The installed preview check requires a clean Windows profile'
}

function Invoke-Setup([string]$Path, [string]$Options) {
    $process = Start-Process -FilePath $Path -ArgumentList $Options -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "$Path exited with code $($process.ExitCode)" }
}

try {
    Invoke-Setup $Installer "/S /D=$destination"
    if (!(Test-Path -LiteralPath $exe)) { throw 'The installer did not create the desktop executable' }

    $env:ELECTRON_RUN_AS_NODE = '1'
    try {
        # Start-Process waits for the GUI-subsystem executable and returns its actual exit code.
        $probe = Join-Path $PSScriptRoot 'check-chromium.cjs'
        $check = Start-Process -FilePath $exe -ArgumentList "`"$probe`" `"$destination`"" -PassThru -Wait -NoNewWindow
        if ($check.ExitCode -ne 0) { throw "Bundled Chromium check failed ($($check.ExitCode))" }
    } finally { Remove-Item Env:ELECTRON_RUN_AS_NODE }

    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { $port = $listener.LocalEndpoint.Port } finally { $listener.Stop() }
    $app = Start-Process -FilePath $exe -ArgumentList @("--remote-debugging-port=$port", '--remote-debugging-address=127.0.0.1') -PassThru
    try {
        node (Join-Path $PSScriptRoot 'check-browser.mjs') $port
        if ($LASTEXITCODE -ne 0) { throw 'The installed desktop browser check failed' }
        $profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json
        if ($profile.dsh.profile.bundles -notcontains 'oh-my-dsh') { throw 'The initial profile did not enable OMD' }
    } finally {
        if (!$app.HasExited) {
            [void]$app.CloseMainWindow()
            if (!$app.WaitForExit(5000)) {
                taskkill.exe /PID $app.Id /T /F | Out-Null
                if (!$app.WaitForExit(15000)) { throw 'The isolated preview process did not exit' }
            }
        }
    }
} finally {
    if (Test-Path -LiteralPath $destination) {
        $uninstallers = @(Get-ChildItem -LiteralPath $destination -File -Filter 'Uninstall*.exe')
        if ($uninstallers.Count -ne 1) { throw 'The preview installation lacks its uninstaller' }
        Invoke-Setup $uninstallers[0].FullName '/S'
    }
}
if ((Test-Path -LiteralPath $exe) -or !(Test-Path -LiteralPath $profilePath)) {
    throw 'Uninstall did not remove the application and preserve the OMD profile'
}
Write-Output 'Verified the Windows install, bundled Chromium, desktop browser, enabled profile and uninstall.'
