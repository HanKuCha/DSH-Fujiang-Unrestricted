#!/usr/bin/env python3
"""Assemble the release ZIP for DSH Fujiang Unrestricted.

Layout produced:

    outputs/DSH-Fujiang-Unrestricted-v<version>.zip
      DSH-Fujiang-Unrestricted-v<version>/
        DSH-Fujiang-Installer.exe
        payload/
        package/*.cmd            (flattened to the root)
        README.md
        SHA256SUMS.txt
        安装说明.txt

Usage:
    powershell -File src/build.ps1      # first, to produce dist/*.exe
    python tools/package-release.py
"""
from __future__ import annotations

import hashlib
import re
import shutil
import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "src" / "DSHInstaller.cs"
EXE = REPO / "dist" / "DSH-Fujiang-Installer.exe"
PAYLOAD = REPO / "payload"
PACKAGE = REPO / "package"
OUT = REPO / "outputs"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def read_version() -> str:
    text = SRC.read_text(encoding="utf-8-sig")
    match = re.search(r'AssemblyVersion\("(\d+\.\d+\.\d+)', text)
    if not match:
        sys.exit("无法从 src/DSHInstaller.cs 的 AssemblyVersion 读出主版本号")
    return match.group(1)


def main() -> None:
    if not EXE.exists():
        sys.exit(f"找不到 {EXE}，先运行 src/build.ps1 编译")

    version = read_version()
    root_name = f"DSH-Fujiang-Unrestricted-v{version}"
    stage = OUT / root_name
    archive = OUT / f"{root_name}.zip"

    if stage.exists():
        if stage.resolve().parent != OUT.resolve():
            sys.exit("打包目录不在 outputs 内")
        shutil.rmtree(stage)
    stage.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    # 1. 安装器
    shutil.copy2(EXE, stage / EXE.name)

    # 2. payload（预设 + 技能）
    shutil.copytree(PAYLOAD, stage / "payload")

    # 3. 发布包内辅助脚本
    for cmd in sorted(PACKAGE.glob("*.cmd")):
        shutil.copy2(cmd, stage / cmd.name)

    # 4. 文档
    shutil.copy2(REPO / "README.md", stage / "README.md")
    shutil.copy2(REPO / "LICENSE", stage / "LICENSE")
    shutil.copy2(REPO / "THIRD_PARTY_NOTICES.md", stage / "THIRD_PARTY_NOTICES.md")
    install_note = REPO / "docs" / "安装说明.txt"
    if install_note.exists():
        shutil.copy2(install_note, stage / "安装说明.txt")

    # 5. 安装器的预设哈希必须和 payload 里的一致
    source = SRC.read_text(encoding="utf-8-sig")
    expected = re.search(r'ExpectedPresetSha256\s*=\s*"([0-9A-Fa-f]+)"', source).group(1).upper()
    actual = sha256(stage / "payload" / "dsh-ws-helper-preset" / "cordis.patch.yml")
    if expected != actual:
        sys.exit(f"预设哈希不匹配：源码写死 {expected}，payload 实际 {actual}")

    # 6. SHA256SUMS.txt
    files = sorted(p for p in stage.rglob("*") if p.is_file())
    manifest = "".join(
        f"{sha256(p)}  {p.relative_to(stage).as_posix()}\n" for p in files
    )
    (stage / "SHA256SUMS.txt").write_text(manifest, encoding="utf-8")

    # 7. 打包
    if archive.exists():
        archive.unlink()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path in sorted(stage.rglob("*")):
            if path.is_file():
                z.write(path, f"{root_name}/{path.relative_to(stage).as_posix()}")

    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:
            sys.exit("ZIP CRC 校验失败")
        for path in stage.rglob("*"):
            if path.is_file():
                rel = f"{root_name}/{path.relative_to(stage).as_posix()}"
                if z.read(rel) != path.read_bytes():
                    sys.exit(f"ZIP 内容不一致：{rel}")

    print(f"版本：       {version}")
    print(f"包内文件：   {len(files) + 1}")
    print(f"EXE 大小：   {(stage / EXE.name).stat().st_size:,} B")
    print(f"ZIP 大小：   {archive.stat().st_size:,} B")
    print(f"ZIP SHA256： {sha256(archive)}")
    print(f"输出：       {archive}")


if __name__ == "__main__":
    main()
