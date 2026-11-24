# Kio -> Kiosk Downloader Bridge, 1.2.0-beta.2
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
$entryPath = Join-Path $root 'KioLauncher.exe'
$regPath = 'Software\Classes\kioffdl'

function Notify([string] $message, [bool] $errorState = $false) {
    if ($Uri) {
        (New-Object -ComObject WScript.Shell).Popup($message, 6, 'Kio Downloader Bridge', 48) | Out-Null
        return
    }
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
function PasteOnlyIntoDownloader([string] $exe, [string] $link) {
    $name = [IO.Path]::GetFileNameWithoutExtension($exe)
    $existing = Get-Process -Name $name,'Kiosk Downloader','kiosk-downloader' -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -and ($_.Path -eq $exe -or $_.MainWindowTitle -eq 'Kiosk Desktop') } |
        Select-Object -First 1
    if (!$existing) {
        $info = New-Object System.Diagnostics.ProcessStartInfo
        $info.FileName = $exe
        $info.UseShellExecute = $true
        $info.WorkingDirectory = [IO.Path]::GetDirectoryName($exe)
        $launched = [Diagnostics.Process]::Start($info)
        if ($launched) { $launched.Dispose() }
    } else {
        [void](New-Object -ComObject WScript.Shell).AppActivate([int]$existing.Id)
    }
    $shell = New-Object -ComObject WScript.Shell
    # Verify the foreground PID before sending keystrokes, so no other app receives the link.
    if (-not ('KioForeground' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class KioForeground {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
    }
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    $ui = [System.Windows.Automation.AutomationElement]
    $scope = [System.Windows.Automation.TreeScope]::Descendants
    $fieldId = New-Object System.Windows.Automation.PropertyCondition($ui::AutomationIdProperty, 'url-input')
    $fieldLabel = New-Object System.Windows.Automation.PropertyCondition($ui::NameProperty, '공유 링크')
    $fieldIdentity = New-Object System.Windows.Automation.OrCondition($fieldId, $fieldLabel)
    $editType = New-Object System.Windows.Automation.PropertyCondition($ui::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
    $urlField = New-Object System.Windows.Automation.AndCondition($editType, $fieldIdentity)
    $downloadName = New-Object System.Windows.Automation.PropertyCondition($ui::NameProperty, '다운로드')
    $buttonType = New-Object System.Windows.Automation.PropertyCondition($ui::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
    $downloadsButton = New-Object System.Windows.Automation.AndCondition($downloadName, $buttonType)
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    $nextSend = [DateTime]::MinValue
    $sends = 0
    do {
        $candidates = @(Get-Process -Name $name,'Kiosk Downloader','kiosk-downloader' -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Sort-Object Id -Unique)
        foreach ($proc in $candidates) {
            $sameExe = [string]::Equals($proc.Path, $exe, [StringComparison]::OrdinalIgnoreCase)
            if (!$sameExe -and $proc.MainWindowTitle -ne 'Kiosk Desktop') { continue }
            try {
                $handle = $proc.MainWindowHandle
                $window = $ui::FromHandle($handle)
                $field = $window.FindFirst($scope, $urlField)
                if ($field -and !$field.Current.IsOffscreen) {
                    $value = $field.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                    if ($value.Current.Value -ceq $link) {
                        if ($sends -eq 0) { [void]$shell.AppActivate([int]$proc.Id) }
                        return $true
                    }
                    $target = $field
                } else {
                    # A rendered toolbar indicates that Electron has mounted the app.
                    $target = $window.FindFirst($scope, $downloadsButton)
                }
                if (!$target -or $target.Current.IsOffscreen -or !$target.Current.IsEnabled) { continue }
                if ($sends -ge 3 -or [DateTime]::UtcNow -lt $nextSend) { continue }
                if (!$shell.AppActivate([int]$proc.Id)) { continue }
                $target.SetFocus()
                Start-Sleep -Milliseconds 100
                if ([KioForeground]::GetForegroundWindow() -ne $handle -or !$target.Current.HasKeyboardFocus) { continue }
                if ([System.Windows.Forms.Clipboard]::GetText() -cne $link) { return $false }
                $shell.SendKeys('^v')
                $sends++
                $nextSend = [DateTime]::UtcNow.AddMilliseconds(1800)
            } catch [System.Windows.Automation.ElementNotAvailableException] {
                # Chromium can replace the accessibility tree while switching views.
                continue
            } catch [System.InvalidOperationException] { continue }
        }
        Start-Sleep -Milliseconds 220
    } while ([DateTime]::UtcNow -lt $deadline)
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
        $entrySource = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;
class KioLauncher {
    [STAThread]
    static void Main(string[] args) {
        if (args.Length != 1 || !Regex.IsMatch(args[0], @"\Akioffdl://open/[A-Za-z0-9_-]{8,4096}/?\z")) return;
        var bridge = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bridge.ps1");
        var host = Path.Combine(Environment.SystemDirectory, @"WindowsPowerShell\v1.0\powershell.exe");
        var info = new ProcessStartInfo(host, "-NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File \"" + bridge + "\" -Uri \"" + args[0] + "\"");
        info.UseShellExecute = false;
        info.CreateNoWindow = true;
        using (Process.Start(info)) {}
    }
}
'@
        $tempExe = Join-Path $root (([Guid]::NewGuid().ToString()) + '.exe')
        try {
            Add-Type -TypeDefinition $entrySource -OutputType WindowsApplication -OutputAssembly $tempExe
            Copy-Item -LiteralPath $tempExe -Destination $entryPath -Force
        } finally {
            Remove-Item -LiteralPath $tempExe -ErrorAction SilentlyContinue
        }
        $command = '"{0}" "%1"' -f $entryPath
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
        if ($command.Contains($launcherPath) -or $command.Contains($entryPath)) {
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
    if (!(PasteOnlyIntoDownloader $exe $link)) {
        Notify '공유 링크가 입력됐는지 확인하지 못했습니다. 다운로더의 새 다운로드 화면에서 공유 링크를 확인해 주세요.' $true
    }
    exit 0
} catch {
    Notify ('Bridge error: ' + $_.Exception.Message) $true
    exit 1
}
