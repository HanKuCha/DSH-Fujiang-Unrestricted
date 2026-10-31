# Builds DSH-Fujiang-Installer.exe with the csc.exe that ships with .NET Framework.
# No SDK required. Run:  powershell -ExecutionPolicy Bypass -File src\build.ps1
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$source = Join-Path $PSScriptRoot 'DSHInstaller.cs'
$manifest = Join-Path $PSScriptRoot 'app.manifest'
$outDir = Join-Path $repo 'dist'
$outExe = Join-Path $outDir 'DSH-Fujiang-Installer.exe'

if (!(Test-Path $source)) { throw "找不到源码：$source" }

# --- 定位 .NET Framework 编译器 -------------------------------------------------
$candidates = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$csc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (!$csc) {
    throw "找不到 .NET Framework 4.x 的 csc.exe。请确认已启用 .NET Framework 4.x（Win10/11 默认自带）。"
}
Write-Host "编译器：$csc"

New-Item -ItemType Directory -Path $outDir -Force | Out-Null
if (Test-Path $outExe) { Remove-Item $outExe -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$payloadZip = Join-Path $outDir 'payload.zip'
if (Test-Path -LiteralPath $payloadZip) { Remove-Item -LiteralPath $payloadZip }
[IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $repo 'payload'), $payloadZip, [IO.Compression.CompressionLevel]::Optimal, $true)

$compilerArgs = @(
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    "/win32manifest:$manifest",
    '/r:System.Windows.Forms.dll',
    '/r:System.Drawing.dll',
    '/r:System.Web.Extensions.dll',
    '/r:System.Core.dll',
    '/r:System.IO.Compression.dll',
    "/resource:$payloadZip,DSHFujiang.Payload.zip",
    "/out:$outExe",
    $source
)

& $csc @compilerArgs
if ($LASTEXITCODE -ne 0) { throw "编译失败，退出码 $LASTEXITCODE" }
if (!(Test-Path $outExe)) { throw "编译未产生 $outExe" }

# --- 校验产物 -------------------------------------------------------------------
$bytes = [IO.File]::ReadAllBytes($outExe)
$pe = [BitConverter]::ToInt32($bytes, 0x3C)
$machine = [BitConverter]::ToUInt16($bytes, $pe + 4)
$subsystem = [BitConverter]::ToUInt16($bytes, $pe + 0x5C)
if ($bytes[0] -ne 0x4D -or $bytes[1] -ne 0x5A) { throw '产物不是 PE 文件' }
if ($machine -ne 0x14C) { throw ('非 AnyCPU（Machine=0x{0:X4}）' -f $machine) }
if ($subsystem -ne 2) { throw "子系统不是 Windows GUI（$subsystem）" }

$hash = (Get-FileHash $outExe -Algorithm SHA256).Hash
Write-Host ""
Write-Host "产物：$outExe"
Write-Host ("大小：{0:N0} B" -f $bytes.Length)
Write-Host "架构：AnyCPU (Machine=0x014C) / GUI"
Write-Host "SHA256：$hash"
Write-Host ""
Write-Host "提示：重新编译的 EXE 与 Release 中的字节不同（csc 会写入随机 MVID 和时间戳），"
Write-Host "      核对手上的 EXE 请比对 Release 的 SHA256SUMS.txt，而不是自己重编。"
