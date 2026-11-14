# Kio -> Kiosk Downloader Bridge, 1.1.1
# Windows PowerShell 5.1+, Windows per-user custom URL handler.
[CmdletBinding(DefaultParameterSetName='Open')]
param(
    [Parameter(ParameterSetName='Install', Mandatory=$true)] [switch] $Install,
    [Parameter(ParameterSetName='Uninstall', Mandatory=$true)] [switch] $Uninstall,
    [Parameter(ParameterSetName='Open', Mandatory=$true)] [string] $Uri
)
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'KioDownloaderBridge'
$configPath = Join-Path $root 'config.json'
$launcherPath = Join-Path $root 'bridge.ps1'
$regPath = 'Software\Classes\kioffdl'

function Notify([string] $message, [bool] $errorState = $false) {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $ico = if ($errorState) { [System.Windows.Forms.MessageBoxIcon]::Error } else { [System.Windows.Forms.MessageBoxIcon]::Information }
        [System.Windows.Forms.MessageBox]::Show($message, 'Kio Downloader Bridge', [System.Windows.Forms.MessageBoxButtons]::OK, $ico) | Out-Null
    } catch { Write-Host $message }
}
function IsExe([string] $path) {
    return [bool]($path -and $path.EndsWith('.exe', [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $path -PathType Leaf))
}
function FindExe {
    if (Test-Path -LiteralPath $configPath) {
        try {
            $old = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if (IsExe ([string]$old.exe)) { return [string]$old.exe }
        } catch {}
    }
    $locations = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Kiosk Downloader'),
        (Join-Path $env:LOCALAPPDATA 'Programs\kiosk-downloader'),
        (Join-Path $env:LOCALAPPDATA 'kiosk-downloader'),
        (Join-Path $env:ProgramFiles 'Kiosk Downloader'),
        (Join-Path $env:ProgramFiles 'kiosk-downloader')
    )
    if (${env:ProgramFiles(x86)}) { $locations += (Join-Path ${env:ProgramFiles(x86)} 'Kiosk Downloader') }
    foreach ($dir in $locations) {
        foreach ($name in @('Kiosk Downloader.exe','kiosk-downloader.exe')) {
            $candidate = Join-Path $dir $name
            if (IsExe $candidate) { return $candidate }
        }
    }
    Add-Type -AssemblyName System.Windows.Forms
    $picker = New-Object System.Windows.Forms.OpenFileDialog
    $picker.Title = 'Choose the Kiosk Downloader executable (.exe)'
    $picker.Filter = 'Executable (*.exe)|*.exe'
    $picker.CheckFileExists = $true
    if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return $null }
    return [string]$picker.FileName
}
function ParseLink([string] $s) {
    if ($s -cnotmatch '^kioffdl://open/([A-Za-z0-9_-]{8,4096})/?$') {
        throw 'Unsupported Kio bridge link.'
    }
    $encoded = $Matches[1].Replace('-', '+').Replace('_', '/')
    switch ($encoded.Length % 4) {
        0 { }
        2 { $encoded += '==' }
        3 { $encoded += '=' }
        default { throw 'Malformed URL data.' }
    }
    $bytes = [Convert]::FromBase64String($encoded)
    $decoder = New-Object System.Text.UTF8Encoding($false, $true)
    $text = $decoder.GetString($bytes)
    $result = $null
    if (![Uri]::TryCreate($text, [UriKind]::Absolute, [ref]$result)) {
        throw 'The share URL is invalid.'
    }
    if ($result.Scheme -cne 'https' -or @('kio.ac','www.kio.ac') -cnotcontains $result.Host -or
        !$result.IsDefaultPort -or $result.UserInfo -or $result.AbsolutePath -cnotmatch '^/c/[A-Za-z0-9_-]+/?$') {
        throw 'Only kio.ac/c/... share links are supported.'
    }
    return $result.GetLeftPart([UriPartial]::Path)
}
function CopyLink([string] $s) {
    Add-Type -AssemblyName System.Windows.Forms
    for ($n=0; $n -lt 8; $n++) {
        try {
            [System.Windows.Forms.Clipboard]::SetText($s, [System.Windows.Forms.TextDataFormat]::UnicodeText)
            return
        } catch { Start-Sleep -Milliseconds 180 }
    }
    Set-Clipboard -Value $s -ErrorAction Stop
}
function PasteOnlyIntoDownloader([string] $exe) {
    # Launching a second Electron instance focuses the first via the app's second-instance handler.
    Start-Process -FilePath $exe -ErrorAction Stop | Out-Null
    $shell = New-Object -ComObject WScript.Shell
    $name = [System.IO.Path]::GetFileNameWithoutExtension($exe)
    # Verify the foreground PID before sending keystrokes, so no other app receives the link.
    if (-not ('KioForeground' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class KioForeground {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
}
'@
    }
    for ($attempt=0; $attempt -lt 45; $attempt++) {
        $candidates = @(Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
        foreach ($proc in $candidates) {
            $sameExe = $false
            try { $sameExe = [string]::Equals($proc.Path, $exe, [StringComparison]::OrdinalIgnoreCase) } catch {}
            # Portable EXEs can unpack and launch the actual app from a temporary path.
            $isKioskWindow = ([string]$proc.MainWindowTitle -eq 'Kiosk Desktop')
            if (-not $sameExe -and -not $isKioskWindow) { continue }
            try {
                if (-not $shell.AppActivate([int]$proc.Id)) { continue }
                Start-Sleep -Milliseconds 250
                [uint32]$foregroundPid = 0
                $handle = [KioForeground]::GetForegroundWindow()
                [void][KioForeground]::GetWindowThreadProcessId($handle, [ref]$foregroundPid)
                if ($foregroundPid -ne [uint32]$proc.Id) { continue }
                $shell.SendKeys('^v')
                return $true
            } catch { continue }
        }
        Start-Sleep -Milliseconds 200
    }
    return $false
}
try {
    if ($Install) {
        $exe = FindExe
        if (!(IsExe $exe)) { throw 'No Kiosk Downloader executable selected. Installation cancelled.' }
        New-Item -ItemType Directory -Path $root -Force | Out-Null
        $from = $MyInvocation.MyCommand.Path
        if (![string]::Equals($from, $launcherPath, [StringComparison]::OrdinalIgnoreCase)) {
            Copy-Item -LiteralPath $from -Destination $launcherPath -Force
        }
        @{ exe = $exe } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
        $command = '"{0}" -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "{1}" -Uri "%1"' -f (Join-Path $PSHOME 'powershell.exe'), $launcherPath
        $rk = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($regPath)
        try {
            $rk.SetValue('', 'URL:Kio Downloader Bridge')
            $rk.SetValue('URL Protocol', '')
            $child = $rk.CreateSubKey('shell\open\command')
            try { $child.SetValue('', $command) } finally { $child.Dispose() }
        } finally { $rk.Dispose() }
        Notify "Bridge installed.`n`nDownloader:`n$exe`n`nClick Kio down-arrow in Firefox to test automatic paste."
        exit 0
    }
    if ($Uninstall) {
        $cmdKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($regPath + '\shell\open\command')
        $command = if ($cmdKey) { [string]$cmdKey.GetValue('') } else { '' }
        if ($cmdKey) { $cmdKey.Dispose() }
        if ($command.Contains($launcherPath)) {
            [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($regPath, $false)
        }
        if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
        Notify 'Windows bridge removed. Kiosk Downloader itself has not been deleted.'
        exit 0
    }
    $link = ParseLink $Uri
    if (!(Test-Path -LiteralPath $configPath)) { throw 'Bridge is not installed. Run install.cmd.' }
    $cfg = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $exe = [string]$cfg.exe
    if (!(IsExe $exe)) { throw 'Kiosk Downloader was moved or removed. Run install.cmd again.' }
    CopyLink $link
    if (-not (PasteOnlyIntoDownloader $exe)) {
        Notify 'The Kio link was copied, but the app window could not be focused safely. Open Kiosk Downloader and press Ctrl+V manually.' $true
    }
} catch {
    Notify ('Bridge error: ' + $_.Exception.Message) $true
    exit 1
}
