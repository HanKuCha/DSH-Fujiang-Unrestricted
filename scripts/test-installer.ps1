param([string]$StagePath)
$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot ('tests 中文 & percent% (space)-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
$releaseVersion = [regex]::Match([IO.File]::ReadAllText((Join-Path (Split-Path $PSScriptRoot) 'src\DSHInstaller.cs')), 'AssemblyVersion\("(\d+\.\d+\.\d+)').Groups[1].Value
$stage = if ($StagePath) { [IO.Path]::GetFullPath($StagePath) } else { Join-Path (Split-Path $PSScriptRoot) ('outputs\DSH-Fujiang-Unrestricted-v' + $releaseVersion) }
New-Item -ItemType Directory -Path $root -Force | Out-Null
$runtime = Join-Path $root 'DSH 程序 & %APPDATA% (test)'
$cliDir = Join-Path $runtime 'resources\runtime\cli\bin'
New-Item -ItemType Directory -Path $cliDir -Force | Out-Null
$exe = Join-Path $runtime 'DeepSeek Harness.exe'
[IO.File]::WriteAllText($exe, 'test fixture, never executed')
$cli = Join-Path $cliDir 'dsh.cmd'
$utf8 = New-Object Text.UTF8Encoding($false)
$script:passed = 0
function Check($condition, $description) {
    if (!$condition) { throw "FAILED: $description" }
    $script:passed++
    Write-Output "PASS $description"
}
function New-Profile($name) {
    $homePath = Join-Path $root $name
    $profile = Join-Path $homePath 'profiles\desktop'
    New-Item -ItemType Directory -Path $profile -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $profile 'package.json'), '{"name":"fixture","private":true,"dependencies":{"keep":"1.0.0"},"dsh":{"profile":{"bundles":["keep"]}},"custom":{"中文":"保留","count":123}}', $utf8)
    [IO.File]::WriteAllText((Join-Path $profile 'cordis.patch.yml'), "[]`r`n", $utf8)
    return $homePath
}
$assembly = [Reflection.Assembly]::LoadFile((Join-Path $stage 'DSH-Fujiang-Installer.exe'))
$service = $assembly.GetType('DSHFujiangInstaller.InstallerService')
$flags = [Reflection.BindingFlags]'Static,NonPublic,Public'
$run = $service.GetMethod('RunInstall', $flags)
[IO.File]::WriteAllText($cli, '@exit /b 99')
$resolve = $service.GetMethod('ResolveDesktopPath', $flags)
foreach ($candidate in @($runtime, $exe, $cli, ('"' + $runtime + '"'), ($runtime + '\'))) {
    Check ($resolve.Invoke($null, @([string]$candidate)) -eq $exe) ('resolve Desktop path: ' + $candidate)
}
$env:DSH_TEST_INSTALL_ROOT = $runtime
try {
    Check ($resolve.Invoke($null, @('%DSH_TEST_INSTALL_ROOT%')) -eq $exe) 'expand environment in install path'
} finally { Remove-Item Env:DSH_TEST_INSTALL_ROOT }
$unrelated = Join-Path $runtime 'other.exe'
[IO.File]::WriteAllText($unrelated, 'unrelated')
$partial = Join-Path $root 'incomplete install'
New-Item -ItemType Directory -Path $partial | Out-Null
[IO.File]::WriteAllText((Join-Path $partial 'DeepSeek Harness.exe'), 'missing CLI')
foreach ($candidate in @('', (Join-Path $root 'missing'), $unrelated, $partial, (Join-Path $root 'unrelated dsh.cmd'))) {
    Check ($null -eq $resolve.Invoke($null, @([string]$candidate))) ('reject incomplete or unrelated path: ' + $candidate)
}
$oldCurrentDirectory = [Environment]::CurrentDirectory
[Environment]::CurrentDirectory = $root
try {
    $relative = Join-Path (Split-Path $runtime -Leaf) 'DeepSeek Harness.exe'
    Check ($resolve.Invoke($null, @([string]$relative)) -eq $exe) 'resolve relative Desktop executable'
} finally { [Environment]::CurrentDirectory = $oldCurrentDirectory }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $root 'DeepSeek Harness.lnk'))
$shortcutRuntime = Join-Path $root 'shortcut target'
New-Item -ItemType Directory -Path (Join-Path $shortcutRuntime 'resources\runtime\cli\bin') -Force | Out-Null
$shortcutExe = Join-Path $shortcutRuntime 'DeepSeek Harness.exe'
[IO.File]::WriteAllText($shortcutExe, 'shortcut fixture')
[IO.File]::WriteAllText((Join-Path $shortcutRuntime 'resources\runtime\cli\bin\dsh.cmd'), '@exit /b 99')
try {
    $shortcut.TargetPath = $shortcutExe
    $shortcut.Save()
    $shortcutPath = Join-Path $root 'DeepSeek Harness.lnk'
    $target = $service.GetMethod('ReadShortcutTarget', $flags).Invoke($null, @([string]$shortcutPath))
    Check ($target -eq $shortcutExe) 'read actual Windows shortcut target'
    Check ($resolve.Invoke($null, @([string]$target)) -eq $shortcutExe) 'resolve shortcut target to complete Desktop install'
} finally {
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut)
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
}
function Install($homePath) {
    return $run.Invoke($null, @([string]$stage, [string]$exe, [string]$homePath))
}
# Simulate the CLI's package link creation, without installing the application.
$linker = Join-Path $root 'mock-linker.ps1'
$linkScript = @'
$ErrorActionPreference='Stop'
$p=Get-Content -LiteralPath (Join-Path $env:DSH_HOME 'profiles\desktop\package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$target=$p.dependencies.'@local/dsh-ws-helper-preset'.Substring(5)
$link=Join-Path $env:DSH_HOME 'profiles\desktop\node_modules\@local\dsh-ws-helper-preset'
New-Item -ItemType Directory -Force -Path (Split-Path $link) | Out-Null
if (!(Test-Path -LiteralPath $link)) { New-Item -ItemType Junction -Path $link -Target $target | Out-Null }
'@
[IO.File]::WriteAllText($linker,$linkScript,$utf8)
$env:DSH_TEST_LINKER=$linker
$success = @'
@echo off
setlocal DisableDelayedExpansion
if not "%1 %2 %3 %4"=="plugin --profile desktop install" exit /b 19
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%DSH_TEST_LINKER%"
exit /b %errorlevel%
'@
[IO.File]::WriteAllText($cli, $success, [Text.Encoding]::ASCII)
$homePath = New-Profile '用户 中文 & %TEMP% (1)'
$originalJson = [IO.File]::ReadAllBytes((Join-Path $homePath 'profiles\desktop\package.json'))
$result = Install $homePath
Check ([IO.File]::Exists((Join-Path $result.BackupDirectory 'package.json'))) 'backup created'
Check ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $result.BackupDirectory 'package.json'))) -eq [Convert]::ToBase64String($originalJson)) 'backup preserves original bytes'
$profilePath = Join-Path $homePath 'profiles\desktop\package.json'
$profile = Get-Content -LiteralPath $profilePath -Raw -Encoding UTF8 | ConvertFrom-Json
Check ($profile.custom.'中文' -eq '保留' -and $profile.dependencies.keep -eq '1.0.0') 'unrelated JSON fields preserved'
Check ($profile.dsh.profile.bundles -contains '@local/dsh-ws-helper-preset') 'bundle registered'
Check ([IO.File]::ReadAllBytes($profilePath)[0] -ne 239) 'JSON written without UTF8 BOM'
Check (![IO.File]::ReadAllText((Join-Path $homePath 'profiles\desktop\cordis.patch.yml')).Contains('[]')) 'empty YAML sequence converted before append'
$overlayCases = @(
    @('fresh-comments', "# dsh profile patch`r`n# overrides, disables, and inserts`r`n[]`r`n", "# dsh profile patch`r`n# overrides, disables, and inserts"),
    @('inline-comment', "# preserved`n[ ] # empty root`n", '# empty root'),
    @('broken-prefix', "# preserved`r`n[]`r`n`r`n- id: fujiang`r`n  disabled: true`r`n", '# preserved'),
    @('existing-entries', "# preserve unrelated overrides`r`n- id: keep`r`n  config:`r`n    list: []`r`n", '    list: []'),
    @('existing-upstream', "# keep upstream options`r`n- id: prompt-custom`r`n  disabled: false`r`n  config:`r`n    retained: true`r`n", '    retained: true')
)
foreach ($overlayCase in $overlayCases) {
    $overlayHome = New-Profile $overlayCase[0]
    $overlayPath = Join-Path $overlayHome 'profiles\desktop\cordis.patch.yml'
    [IO.File]::WriteAllText($overlayPath, $overlayCase[1], $utf8)
    $overlayResult = Install $overlayHome
    $repaired = [IO.File]::ReadAllText($overlayPath)
    Check ($repaired.Contains($overlayCase[2])) ("preserve comments or nested lists: " + $overlayCase[0])
    Check ([IO.File]::ReadAllText((Join-Path $overlayResult.BackupDirectory 'cordis.patch.yml')) -eq $overlayCase[1]) ("backup original overlay: " + $overlayCase[0])
    Check (@([regex]::Matches($repaired, '(?m)^- id: fujiang\r?$')).Count -eq 1) ("single fujiang override: " + $overlayCase[0])
    Check ($repaired -notmatch '(?m)^\s*\[\s*\]\s*(#.*)?\r?$') ("no empty root before block entries: " + $overlayCase[0])
    Check ($repaired -match '(?m)^  disabled: true\r?$') 'upstream duplicate injection disabled'
    if ($overlayCase[0] -eq 'existing-upstream') {
        $null = $service.GetMethod('RemovePreset', $flags).Invoke($null, @([string]$overlayHome))
        Check ([IO.File]::ReadAllText($overlayPath) -match '- id: prompt-custom\r?\n  config:') 'uninstall retains upstream options with a valid root entry'
    }
}
$customSkill = Join-Path $homePath 'plugins\dsh-ws-helper-preset\skills\user-skill\SKILL.md'
New-Item -ItemType Directory -Force -Path (Split-Path $customSkill) | Out-Null
[IO.File]::WriteAllText($customSkill, 'user-owned skill', $utf8)
$result2 = Install $homePath
Check ([IO.File]::ReadAllText($customSkill) -eq 'user-owned skill') 'upgrade preserves user-added skills'
$profile = Get-Content -LiteralPath $profilePath -Raw -Encoding UTF8 | ConvertFrom-Json
Check (@($profile.dsh.profile.bundles | Where-Object { $_ -eq '@local/dsh-ws-helper-preset' }).Count -eq 1) 'repeat install does not duplicate bundle'
Check ($result.BackupDirectory -ne $result2.BackupDirectory) 'repeat install has independent backups'
[IO.File]::WriteAllText($cli, "@echo off`r`nexit /b 37`r`n", [Text.Encoding]::ASCII)
$reused = Install $homePath
Check (($reused.Output -join '') -match '复用现有本地链接') 'existing link upgrade avoids unrelated dependency resolution'
Check (@(Get-ChildItem -LiteralPath (Join-Path $homePath 'plugins\dsh-ws-helper-preset') -Filter '.installer-link-*' -Force).Count -eq 0) 'link probe cleans up temporary files'
[IO.File]::WriteAllText($cli, $success, [Text.Encoding]::ASCII)
$payload = Join-Path $stage 'payload'
$installed = Join-Path $homePath 'plugins\dsh-ws-helper-preset'
$mismatches = @()
foreach ($file in Get-ChildItem -LiteralPath $payload -File -Recurse) {
    $rel = $file.FullName.Substring($payload.Length + 1)
    if ($rel.StartsWith('dsh-ws-helper-preset\')) { $rel = $rel.Substring('dsh-ws-helper-preset\'.Length) }
    $dest = Join-Path $installed $rel
    if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath $dest).Hash) { $mismatches += $rel }
}
Check ($mismatches.Count -eq 0) 'all copied payload files match hashes'
# Existing local maintenance paths must stay selected during upgrades.
$localHome = New-Profile 'existing-local'
$localPlugin = Join-Path $localHome 'profiles\desktop\local-plugins\dsh-ws-helper-preset'
New-Item -ItemType Directory -Force -Path $localPlugin | Out-Null
Copy-Item -Path (Join-Path $stage 'payload\dsh-ws-helper-preset\*') -Destination $localPlugin -Recurse
$localManifest = Join-Path $localPlugin 'package.json'
$meta = Get-Content -LiteralPath $localManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$meta.version='2.1.3-desktop-coop.6'
[IO.File]::WriteAllText($localManifest,($meta | ConvertTo-Json -Depth 20),$utf8)
$localProfile = Join-Path $localHome 'profiles\desktop\package.json'
$meta = Get-Content -LiteralPath $localProfile -Raw -Encoding UTF8 | ConvertFrom-Json
$meta.dependencies | Add-Member -NotePropertyName '@local/dsh-ws-helper-preset' -NotePropertyValue ('link:'+$localPlugin.Replace('\','/'))
[IO.File]::WriteAllText($localProfile,($meta | ConvertTo-Json -Depth 20),$utf8)
$null = Install $localHome
$meta = Get-Content -LiteralPath $localProfile -Raw -Encoding UTF8 | ConvertFrom-Json
Check ($meta.dependencies.'@local/dsh-ws-helper-preset' -eq ('link:'+$localPlugin.Replace('\','/'))) 'upgrade preserves existing local maintenance link'
Check ((Get-Content -LiteralPath $localManifest -Raw -Encoding UTF8 | ConvertFrom-Json).version -eq '2.1.3-desktop-coop.15') 'existing local maintenance copy upgraded to current payload'
Check (!(Test-Path -LiteralPath (Join-Path $localHome 'plugins\dsh-ws-helper-preset'))) 'no duplicate shared preset created for existing local link'
$meta = Get-Content -LiteralPath $localManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$meta.version='2.1.3-desktop-coop.16'
[IO.File]::WriteAllText($localManifest,($meta | ConvertTo-Json -Depth 20),$utf8)
$beforeVersionHash=(Get-FileHash -LiteralPath $localManifest).Hash
$rejected=$false
try { $null = Install $localHome } catch { $rejected=$_.Exception.ToString().Contains('拒绝降级') }
Check $rejected 'reject downgrade of newer local preset'
Check ((Get-FileHash -LiteralPath $localManifest).Hash -eq $beforeVersionHash) 'downgrade rejection leaves newer preset unchanged'
# Failures must propagate rather than report successful installation.
foreach ($case in @(@('failure', "@echo off`r`necho fixture-sync-failed`r`nexit /b 37`r`n", '37'), @('missing-link', "@echo off`r`nexit /b 0`r`n", '预设链接'))) {
    [IO.File]::WriteAllText($cli, $case[1], [Text.Encoding]::ASCII)
    $failed = $false
    try { $null = Install (New-Profile $case[0]) } catch { $failed = $_.Exception.ToString().Contains($case[2]) }
    Check $failed ("reject " + $case[0])
}
$badHome = New-Profile 'malformed'
[IO.File]::WriteAllText((Join-Path $badHome 'profiles\desktop\package.json'), '{}')
try { $null = Install $badHome; throw 'expected rejection' } catch { Check ($_.Exception.ToString().Contains('dependencies')) 'invalid profile rejected' }
Check (!(Test-Path -LiteralPath (Join-Path $badHome 'plugins'))) 'invalid profile causes no payload writes'
[IO.File]::WriteAllText($cli, $success, [Text.Encoding]::ASCII)
$remove = $service.GetMethod('RemovePreset', $flags)
$null = $remove.Invoke($null, @([string]$homePath))
$profile = Get-Content -LiteralPath $profilePath -Raw -Encoding UTF8 | ConvertFrom-Json
Check ($profile.dsh.profile.bundles -notcontains '@local/dsh-ws-helper-preset' -and $profile.dependencies.keep -eq '1.0.0') 'uninstall preserves unrelated dependency'
# Exercise the actual executable entry point, including --silent as first argument.
$silentHome = New-Profile 'silent 中文'
$proc = Start-Process -FilePath (Join-Path $stage 'DSH-Fujiang-Installer.exe') -ArgumentList @('--silent', '--dsh-home', ('"' + $silentHome + '"'), '--dsh-exe', ('"' + $runtime + '"')) -PassThru -WindowStyle Hidden
if (!$proc.WaitForExit(30000)) { $proc.Kill(); throw 'Silent entry point timed out' }
Check ($proc.ExitCode -eq 0) 'EXE --silent first argument accepts install directory'
[IO.File]::WriteAllText($cli, "@echo off`r`nexit /b 37`r`n", [Text.Encoding]::ASCII)
$silentFailureHome = New-Profile 'silent-failure'
$proc = Start-Process -FilePath (Join-Path $stage 'DSH-Fujiang-Installer.exe') -ArgumentList @('--silent', '--dsh-home', ('"' + $silentFailureHome + '"'), '--dsh-exe', ('"' + $exe + '"')) -PassThru -WindowStyle Hidden
if (!$proc.WaitForExit(30000)) { $proc.Kill(); throw 'Silent failure timed out' }
Check ($proc.ExitCode -eq 1) 'EXE propagates install failure exit code'
[IO.File]::WriteAllText($cli, $success, [Text.Encoding]::ASCII)
$standalone = Join-Path $root 'standalone EXE'
New-Item -ItemType Directory -Path $standalone | Out-Null
Copy-Item -LiteralPath (Join-Path $stage 'DSH-Fujiang-Installer.exe') -Destination $standalone
$standaloneHome = New-Profile 'standalone-home'
$proc = Start-Process -FilePath (Join-Path $standalone 'DSH-Fujiang-Installer.exe') -ArgumentList @('--silent', '--dsh-home', ('"' + $standaloneHome + '"'), '--dsh-exe', ('"' + $cli + '"')) -PassThru -WindowStyle Hidden
if (!$proc.WaitForExit(30000)) { $proc.Kill(); throw 'Standalone installer timed out' }
Check ($proc.ExitCode -eq 0) 'standalone EXE accepts CLI path and installs without adjacent payload'
Check ([IO.File]::Exists((Join-Path $standaloneHome 'plugins\dsh-ws-helper-preset\upstream\knowledge\triage\SKILL.md'))) 'standalone EXE includes upstream knowledge'
Write-Output "TOTAL_PASS=$script:passed"
