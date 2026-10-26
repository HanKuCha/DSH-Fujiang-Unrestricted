## 安装器兼容性修复版

**payload 未改动** —— 273 个文件逐一比对 SHA-256，与原版完全一致。本版只替换 `DSH-Fujiang-Installer.exe` 与 `SHA256SUMS.txt`。

### 主要变化

- **不再依赖 .NET 10**：原安装器固定 `win-x64` + .NET 10 自包含单文件（49 MB）。本版改为 **.NET Framework 4.x / AnyCPU**，EXE 从 **49 MB → 28 KB**。建议 Windows 10/11 + .NET Framework 4.8（系统自带），这不改变 DSH 本身的系统要求。
- **界面遮挡**：原顶部面板盖住程序路径输入框和「浏览」按钮，无法纠正自动检测结果。修正控件停靠顺序，保留原界面设计。
- **路径检测**：原版只查当前用户默认目录，甚至会把 `dsh.cmd` 当成 Desktop EXE。本版补充 Program Files / Program Files(x86) 与卸载注册表项（HKLM/HKCU × 32/64 视图）检测，并保留手动选择。
- **特殊字符路径**：原 CLI 直接启动在含 `%` 等字符的路径中会失败。本版显式使用系统 `cmd.exe`，关闭 AutoRun 与延迟扩展，传引号包裹的路径，子进程输出按 UTF-8 记录。
- **静默失败**：原依赖同步错误会被吞掉，甚至没有 CLI 也显示安装成功。本版缺少 CLI 时**提前报错**；同步失败、或安装后预设链接不正确，均返回失败。
- **`--silent` 位置**：修正 `--silent` 放在首个参数时未进入静默安装的问题。
- **空 YAML 数组**：`[]` 不能直接追加数组项，现先转为空文本再追加，避免生成无效配置。
- **运行中安装**：安装前检查所选 DSH 是否仍在运行；安装过程中阻止直接关窗；安装后启动 DSH 时传入所选 `DSH_HOME`。
- **写入安全**：写入前检查配置结构；备份目录名加毫秒与 6 位随机标识，避免同秒冲突；保留安装日志供其他机器排查。

### 验证

- 16 项隔离检查通过：备份原始字节、保留无关 JSON 字段、无 BOM JSON、空 YAML、中文/空格/`&`/`%`/括号路径、重复安装、全部 payload 哈希、同步失败、缺失链接、损坏配置、卸载保留其他依赖、实际 EXE 静默成功/失败退出码。
- 本机真实 DSH CLI 在独立 `DSH_HOME` 中执行依赖安装成功，预设链接存在且内容哈希正确。
- 实际打开安装窗口，确认程序路径、`DSH_HOME`、浏览与安装按钮显示正常。
- 验证 PE 为 **AnyCPU / ILONLY**；ZIP CRC 检查及逐文件内容比对通过。
- 未在报错的其他电脑上复现其全部环境，因此不能保证覆盖所有机器的系统、权限、网络或 DSH 版本问题。

### 下载哪个

| 文件 | 用途 |
| --- | --- |
| `DSH-Fujiang-Unrestricted-v1.0.2.zip` | **推荐**。完整包，解压后双击 EXE 即可 |
| `DSH-Fujiang-Installer.exe` | 只替换安装器本体；覆盖到已解压的完整目录中同名文件 |

> EXE 必须和旁边的 `payload\` 目录一起用，单独拿出去跑会报找不到 payload。

### 安装

1. 先启动一次 **DSH Desktop**，确认能打开，然后**完全退出**（托盘也退）。
2. 解压整个 ZIP，双击 **`DSH-Fujiang-Installer.exe`**。
3. 确认检测到的 `DeepSeek Harness.exe` 与 `DSH_HOME`（默认 `C:\Users\<你>\.dsh`），不对就手动改。
4. 点 **「安装到 DSH Desktop」**。
5. 打开 DSH，**新会话**在预设里选 **「工作助手」**。

双击没反应就跑 `修复-运行安装器.cmd`（保留控制台窗口显示错误）。
卸载用 `卸载-工作助手预设.cmd` 或 `DSH-Fujiang-Installer.exe --uninstall`。

### 日志与备份

| | 路径 |
| --- | --- |
| 日志 | `%LOCALAPPDATA%\DSH-Fujiang-Installer\logs\installer-*.log` |
| 备份 | `<DSH_HOME>\installer-backups\<时间戳>-<标识>\` |

### 包内容

- `DSH-Fujiang-Installer.exe`（28,672 B，AnyCPU / ILONLY）
- `payload/dsh-ws-helper-preset` —— 富江人格预设（`@local/dsh-ws-helper-preset` v2.1.2）
- `payload/skills` —— 240 个随包技能（273 个文件，约 6.2 MB）
- `README.md` / `安装说明.txt` / `修复-运行安装器.cmd` / `卸载-工作助手预设.cmd` / `SHA256SUMS.txt`

### 校验

```powershell
Get-FileHash DSH-Fujiang-Unrestricted-v1.0.2.zip -Algorithm SHA256
```

- ZIP SHA-256：`5215CF81F64176001DD3C2ED90FACD0B84C81A072303EA15C14F2DF9DAFB015C`
- EXE SHA-256：`07A3D1C3F9456C6AC4D87467A48F54AD6F31DB1F97AEAC57EF1B81BC64240999`
- 预设 SHA-256：`0B3EB6EC47CF2C1365A0390C8EB5583F57D780794F5D7522B33C7C8C0584878E`

安装器内部把这个预设哈希写死（`ExpectedPresetSha256`），装完会回读并比对，不一致直接报失败。

### 说明

- 只改当前用户的 `DSH_HOME`，不写 DSH 程序目录，不请求管理员权限。
- 不关闭 DSH 的沙箱、审批栈或工具权限。
- 不含 DSH 程序本体；需自行安装官方 DeepSeek Harness Desktop 0.2.x。
- 只支持 **Desktop** profile；`dsh web`（`web` profile）不走这个安装器。

从源码重建见仓库 `src/build.ps1` 与 `tools/package-release.py`。重编的 EXE 与这里的字节不同（csc 会写入随机 MVID 和时间戳），核对请比对上面的 SHA-256。
