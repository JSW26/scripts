# Kio -> Kiosk Downloader Windows Bridge
# Windows PowerShell 5.1+, per-user registration; no administrator required.
# The browser invokes: kioffdl://open/<base64url encoded https://kio.ac/c/...>
[CmdletBinding(DefaultParameterSetName='Open')]
param(
    [Parameter(ParameterSetName='Install', Mandatory=$true)] [switch] $Install,
    [Parameter(ParameterSetName='Uninstall', Mandatory=$true)] [switch] $Uninstall,
    [Parameter(ParameterSetName='Open', Mandatory=$true)] [string] $Uri
)
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'KioDownloaderBridge'
$configFile = Join-Path $root 'config.json'
$installedScript = Join-Path $root 'bridge.ps1'
$schemeKey = 'Software\Classes\kioffdl'

function Notify([string]$message, [bool]$isError = $false) {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $icon = if ($isError) { [System.Windows.Forms.MessageBoxIcon]::Error } else { [System.Windows.Forms.MessageBoxIcon]::Information }
        [System.Windows.Forms.MessageBox]::Show($message, 'Kio -> Kiosk Downloader', [System.Windows.Forms.MessageBoxButtons]::OK, $icon) | Out-Null
    } catch {
        Write-Host $message
    }
}
function ValidExe([string]$path) {
    return ($path -and $path.EndsWith('.exe', [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $path -PathType Leaf))
}
function FindDownloader {
    if (Test-Path -LiteralPath $configFile) {
        try {
            $old = Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
            if (ValidExe $old.exe) { return [string]$old.exe }
        } catch { }
    }
    $dirs = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\kiosk-downloader'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Kiosk Downloader'),
        (Join-Path $env:LOCALAPPDATA 'kiosk-downloader'),
        (Join-Path $env:ProgramFiles 'Kiosk Downloader'),
        (Join-Path $env:ProgramFiles 'kiosk-downloader')
    )
    if (${env:ProgramFiles(x86)}) {
        $dirs += Join-Path ${env:ProgramFiles(x86)} 'Kiosk Downloader'
    }
    foreach ($dir in $dirs) {
        foreach ($name in @('Kiosk Downloader.exe', 'kiosk-downloader.exe')) {
            $candidate = Join-Path $dir $name
            if (ValidExe $candidate) { return $candidate }
        }
    }
    foreach ($hive in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
        if (!(Test-Path $hive)) { continue }
        foreach ($entry in (Get-ChildItem -Path $hive -ErrorAction SilentlyContinue)) {
            $props = Get-ItemProperty -LiteralPath $entry.PSPath -ErrorAction SilentlyContinue
            if ($props.DisplayName -notmatch 'Kiosk Downloader') { continue }
            $iconPath = ([string]$props.DisplayIcon -replace ',\d+$', '').Trim('"')
            if (ValidExe $iconPath) { return $iconPath }
            if ($props.InstallLocation) {
                foreach ($name in @('Kiosk Downloader.exe', 'kiosk-downloader.exe')) {
                    $candidate = Join-Path $props.InstallLocation $name
                    if (ValidExe $candidate) { return $candidate }
                }
            }
        }
    }
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = 'Select Kiosk Downloader.exe (installed or portable)'
    $dialog.Filter = 'Windows executable (*.exe)|*.exe'
    $dialog.CheckFileExists = $true
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return $null }
    return $dialog.FileName
}
function GetUrlFromProtocol([string]$rawUri) {
    # Strictly constrain the handler to the format emitted by the userscript.
    if ($rawUri -cnotmatch '^kioffdl://open/([A-Za-z0-9_-]{8,4096})/?$') {
        throw 'Invalid Kio bridge URL format.'
    }
    $payload = $Matches[1].Replace('-', '+').Replace('_', '/')
    switch ($payload.Length % 4) {
        0 { }
        2 { $payload += '==' }
        3 { $payload += '=' }
        default { throw 'Invalid URL payload.' }
    }
    $bytes = [Convert]::FromBase64String($payload)
    $utf8 = [System.Text.UTF8Encoding]::new($false, $true)
    $urlString = $utf8.GetString($bytes)
    $url = $null
    if (![Uri]::TryCreate($urlString, [UriKind]::Absolute, [ref]$url)) {
        throw 'Invalid share URL.'
    }
    if ($url.Scheme -cne 'https' -or @('kio.ac','www.kio.ac') -cnotcontains $url.Host -or !$url.IsDefaultPort -or $url.UserInfo -or $url.AbsolutePath -cnotmatch '^/c/[A-Za-z0-9_-]+/?$') {
        throw 'Only https://kio.ac/c/... share links are allowed.'
    }
    return $url.GetLeftPart([UriPartial]::Path)
}
function CopyShareUrl([string]$value) {
    Add-Type -AssemblyName System.Windows.Forms
    $errors = @()
    # Clipboard can be temporarily locked by another application.
    for ($i=0; $i -lt 8; $i++) {
        try {
            [System.Windows.Forms.Clipboard]::SetText($value, [System.Windows.Forms.TextDataFormat]::UnicodeText)
            return
        } catch {
            $errors += $_.Exception.Message
            Start-Sleep -Milliseconds 160
        }
    }
    try {
        Set-Clipboard -Value $value -ErrorAction Stop
        return
    } catch {
        throw ('Failed to copy URL to the clipboard: ' + $_.Exception.Message)
    }
}

try {
    if ($Install) {
        $exe = FindDownloader
        if (!(ValidExe $exe)) { throw 'No Kiosk Downloader executable selected. Installation cancelled.' }
        New-Item -ItemType Directory -Path $root -Force | Out-Null
        $source = $MyInvocation.MyCommand.Path
        if (![string]::Equals($source, $installedScript, [StringComparison]::OrdinalIgnoreCase)) {
            Copy-Item -LiteralPath $source -Destination $installedScript -Force
        }
        @{ exe = $exe } | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8
        $powerShellExe = Join-Path $PSHOME 'powershell.exe'
        $command = '"{0}" -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "{1}" -Uri "%1"' -f $powerShellExe, $installedScript
        $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($schemeKey)
        try {
            $key.SetValue('', 'URL:Kio to Kiosk Downloader')
            $key.SetValue('URL Protocol', '')
            $commandKey = $key.CreateSubKey('shell\open\command')
            try { $commandKey.SetValue('', $command) } finally { $commandKey.Dispose() }
        } finally { $key.Dispose() }
        Notify "Windows connection installed.`n`nDownloader:`n$exe`n`nReturn to Firefox and click Kio down-arrow."
        exit 0
    }
    if ($Uninstall) {
        # Only remove the scheme if it still points to our own installed handler.
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($schemeKey)
        if ($key) {
            $key.Dispose()
            $commandKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($schemeKey + '\shell\open\command')
            $command = if ($commandKey) { [string]$commandKey.GetValue('') } else { '' }
            if ($commandKey) { $commandKey.Dispose() }
            if ($command.Contains($installedScript)) {
                [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($schemeKey, $false)
            }
        }
        if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
        Notify 'Kio Windows connection uninstalled. The Kiosk Downloader application was not removed.'
        exit 0
    }
    $url = GetUrlFromProtocol $Uri
    if (!(Test-Path -LiteralPath $configFile)) { throw 'The bridge is not installed. Run install.cmd again.' }
    $settings = Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $exe = [string]$settings.exe
    if (!(ValidExe $exe)) { throw 'Kiosk Downloader executable was moved or removed. Run install.cmd again.' }
    CopyShareUrl $url
    # Launch the actual application. A native URL-import API is not assumed.
    # If already running, bring it to the foreground rather than open another copy.
    $existing = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        try { $_.Path -and [string]::Equals($_.Path, $exe, [StringComparison]::OrdinalIgnoreCase) } catch { $false }
    } | Select-Object -First 1
    if ($existing) {
        try {
            $shell = New-Object -ComObject WScript.Shell
            if (!$shell.AppActivate($existing.Id)) { Start-Process -FilePath $exe }
        } catch { Start-Process -FilePath $exe }
    } else {
        Start-Process -FilePath $exe
    }
} catch {
    Notify ("Error: " + $_.Exception.Message) $true
    exit 1
}
