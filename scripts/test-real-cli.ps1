$ErrorActionPreference = 'Stop'
$stage = Join-Path $PSScriptRoot 'stage\DSH-Fujiang-Unrestricted-v1.0.2'
$testHome = Join-Path $PSScriptRoot ('real-cli-home-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
$profile = Join-Path $testHome 'profiles\desktop'
New-Item -ItemType Directory -Path $profile -Force | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
$target = Join-Path $stage 'payload\dsh-ws-helper-preset'
$package = @{name='installer-test';private=$true;dependencies=@{'@local/dsh-ws-helper-preset'=('link:'+$target.Replace('\','/'))};dsh=@{profile=@{bundles=@('@local/dsh-ws-helper-preset')}}}
[IO.File]::WriteAllText((Join-Path $profile 'package.json'), ($package | ConvertTo-Json -Depth 10), $utf8)
[IO.File]::WriteAllText((Join-Path $profile 'cordis.patch.yml'), "[]`r`n", $utf8)
$assembly = [Reflection.Assembly]::LoadFile((Join-Path $stage 'DSH-Fujiang-Installer.exe'))
$run = $assembly.GetType('DSHFujiangInstaller.InstallerService').GetMethod('RunCli', [Reflection.BindingFlags]'Static,NonPublic')
$cli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$output = $run.Invoke($null, @([string]$cli,[string]$testHome,300000,[string[]]@('plugin','--profile','desktop','install')))
Write-Output $output
$installed = Join-Path $profile 'node_modules\@local\dsh-ws-helper-preset\cordis.patch.yml'
if (!(Test-Path -LiteralPath $installed)) { throw 'Real CLI did not create the local package link' }
if ((Get-FileHash -LiteralPath $installed).Hash -ne (Get-FileHash -LiteralPath (Join-Path $target 'cordis.patch.yml')).Hash) { throw 'Real CLI linked different content' }
Write-Output 'REAL_CLI_PASS=1'
