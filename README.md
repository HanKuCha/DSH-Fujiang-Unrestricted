<p align="center">
  <strong>DSH Fujiang Unrestricted</strong><br>
  <em>DeepSeek Harness Desktop 一键安装包：富江人格预设 + 240 个随包技能</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.2-1a73e8" alt="version">
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6" alt="platform">
  <img src="https://img.shields.io/badge/.NET%20Framework-4.8-512BD4" alt="dotnet">
  <img src="https://img.shields.io/badge/arch-AnyCPU-lightgrey" alt="arch">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
</p>

---

## 这是什么

一个面向 **DeepSeek Harness Desktop**（Windows 桌面端 0.2.x）的**一键安装器**。

装完以后，DSH 的会话预设选择器里会多出一个 **「工作助手」（`ws-helper`）**。它由三部分组成：

1. **一份固定人格提示词** —— 整段接管系统提示词（`persona: complete: true`），内容是一个「不设限」的助手人格：反拒绝黑名单、意图映射、逐级降级阶梯、禁止中途撤回、交付契约。
2. **全套标准工具面** —— 持久 shell、文件读写与搜索、后台任务、计划模式、子代理 / 工作流、上下文压缩、技能加载、`present` 等。
3. **240 个随包技能** —— 一个覆盖面很宽的攻防知识库，随预设一起落地到 `payload/skills`，由 `skill-filesystem` 挂载。

安装器只做四件事：**检测 DSH → 备份 profile → 复制预设与技能 → 注册依赖和 bundle**。

它**不碰** DSH 程序目录，**不关**沙箱，**不关**审批，**不改** `@deepseek-ai` 任何包文件。

---

## 它装了什么

```
payload/
├── dsh-ws-helper-preset/           # 预设本体（2 个文件）
│   ├── cordis.patch.yml            # 29,547 B —— persona + 全套工具面组合
│   └── package.json                # 481 B  —— @local/dsh-ws-helper-preset v2.1.2
└── skills/                         # 240 个技能，271 个文件，约 6.2 MB
    ├── hunt-sqli/ SKILL.md
    ├── hunt-xss/ SKILL.md
    ├── hunt-ssrf/ SKILL.md
    ├── offensive-active-directory/ SKILL.md
    ├── hunt-k8s/ SKILL.md
    ├── apk-redteam-pipeline/ SKILL.md
    ├── offensive-wpa3-sae/ SKILL.md
    ├── hunt-llm-ai/ SKILL.md
    ├── report-writing/ SKILL.md
    └── …（共 240 个）
```

技能分类覆盖：Web 漏洞（SQLi / XSS / SSRF / SSTI / XXE / IDOR / 竞态 / 请求走私 / 缓存投毒 / JWT / OAuth / SAML / GraphQL / WebSocket…）、Active Directory 与内网、云与容器（AWS / Azure / GCP / K8s / Docker）、移动端（APK / iOS）、无线与硬件（WPA2 / WPA3 / BLE / Zigbee / LoRaWAN）、LLM 与 AI 应用（提示词注入 / MCP / RAG / Agentic）、供应链、取证对抗、报告撰写。

---

## 环境要求

| 项目 | 要求 |
| --- | --- |
| 系统 | Windows 10 / 11（x64 或 x86 均可） |
| 运行时 | .NET Framework 4.8（Windows 10 1903+ / Windows 11 自带） |
| 宿主 | DeepSeek Harness **Desktop 0.2.x**，已至少启动过一次（生成 `desktop` profile） |
| 权限 | 普通用户即可；**不需要**管理员 |

> 安装器本身是 **AnyCPU / ILONLY** 的 .NET Framework WinForms 程序，不携带运行时，体积 28 KB。

---

## 安装

1. 先启动一次 **DSH Desktop**，确认能正常打开，然后**完全退出**（托盘也退）。
2. 解压整个 ZIP，**双击 `DSH-Fujiang-Installer.exe`**。
3. 确认自动检测到的 `DeepSeek Harness.exe` 与 `DSH_HOME`（默认 `C:\Users\<你>\.dsh`），不对就手动改。
4. 点 **「安装到 DSH Desktop」**。成功后可勾选直接启动 DSH。
5. 打开 DSH，**新会话**在预设里选 **「工作助手」**。

> 不要只把 EXE 单独拿出来跑 —— 它需要旁边的 `payload\` 目录。

如果双击没反应或被拦截：

```
双击  修复-运行安装器.cmd      # 从当前目录调用 EXE，保留控制台窗口显示错误
```

---

## 卸载

两种方式，等价：

```
双击  卸载-工作助手预设.cmd
# 或
DSH-Fujiang-Installer.exe --uninstall
```

卸载会**先备份** profile，再从 `package.json` 里摘掉依赖与 bundle 条目，然后调用 DSH CLI 同步依赖。

**手动恢复**：关闭 DSH，把备份目录里的 `package.json`、`cordis.patch.yml` 及原有锁文件还原到 `DSH_HOME\profiles\desktop`；如果备份里有 `old-plugin`，还原到 `DSH_HOME\plugins\dsh-ws-helper-preset`，再用 DSH 的插件管理器同步一次。

| 位置 | 路径 |
| --- | --- |
| 安装日志 | `%LOCALAPPDATA%\DSH-Fujiang-Installer\logs\installer-*.log` |
| 自动备份 | `<DSH_HOME>\installer-backups\<时间戳>-<标识>\` |

---

## 校验

发布包内附 `SHA256SUMS.txt`（逐文件）。核心几项：

| 文件 | SHA-256 |
| --- | --- |
| `payload/dsh-ws-helper-preset/cordis.patch.yml` | `0B3EB6EC47CF2C1365A0390C8EB5583F57D780794F5D7522B33C7C8C0584878E` |
| `payload/dsh-ws-helper-preset/package.json` | `EE9C0CA9D2C1C595434E7B3AE733D68BE369440DE2116067223B9DEE2A63439D` |
| `DSH-Fujiang-Installer.exe` | 见 Release 附带的 `SHA256SUMS.txt` |

安装器内部也把这个预设哈希**写死**了（`ExpectedPresetSha256`）。安装完会回读 profile 里链接到的 `cordis.patch.yml` 并比对，不一致就报失败 —— 不会出现「装完了但装的不是这个预设」。

---

## 从源码构建

```powershell
# 需要 .NET Framework 4.x 自带的 csc.exe（Win10/11 内置，无需装 SDK）
powershell -ExecutionPolicy Bypass -File src\build.ps1
```

产物在 `dist\DSH-Fujiang-Installer.exe`，约 28 KB。

> 重新编译出来的 EXE 与 Release 里的**字节不同**（.NET Framework 版 csc 会写入随机 MVID 和时间戳），但源码与行为一致。要核对你手上的 EXE 是不是这份源码编的，比 Release 里的 SHA-256，而不是自己重编。

打包成发布 ZIP：

```powershell
python tools\package-release.py
# → outputs/DSH-Fujiang-Unrestricted-v<version>.zip + SHA256SUMS.txt
```

---

## 仓库结构

```
.
├── src/
│   ├── DSHInstaller.cs            # 安装器全部逻辑（WinForms，873 行）
│   ├── app.manifest               # 清单（普通用户权限，不请求提权）
│   └── build.ps1                  # 一键编译
├── payload/
│   ├── dsh-ws-helper-preset/      # 预设：persona + 工具面
│   └── skills/                    # 240 个随包技能
├── package/                       # 只进发布包的辅助脚本
│   ├── 修复-运行安装器.cmd
│   └── 卸载-工作助手预设.cmd
├── docs/
│   ├── 安装说明.txt
│   └── 修复说明.txt               # 1.0.2 兼容性修复明细
├── scripts/
│   ├── test-installer.ps1         # 16 项隔离安装测试（中文/空格/&/%/括号路径）
│   └── test-real-cli.ps1          # 用真实 DSH CLI 在独立 DSH_HOME 里验证
├── tools/
│   ├── package-release.py         # 组装发布 ZIP + 生成 SHA256SUMS
│   └── migrate-1.0-to-1.0.2.py    # 1.0 → 1.0.2 的源码迁移脚本（留档）
├── CHANGELOG.md
└── README.md
```

---

## 安装器做了什么（逐步）

```
1. 检测      读注册表（HKLM/HKCU × 32/64 视图）Uninstall 项 + Program Files 兜底，
             找 DeepSeek Harness.exe；找不到就让你手动选
2. 校验      从 EXE 同级目录定位 resources\runtime\cli\bin\dsh.cmd，
             没有 CLI 直接报错（不会假装成功）
3. 前置检查  目标 DSH 进程还在跑就中止，避免覆盖运行中的配置
4. 预校验    先读一遍 profile package.json，确认 dependencies / dsh.profile.bundles 结构在，
             再动手写
5. 备份      复制 profiles\desktop 到 <DSH_HOME>\installer-backups\<时间戳>-<6位标识>\
6. 写入      复制 payload\dsh-ws-helper-preset → plugins\dsh-ws-helper-preset
             package.json 里 upsert 依赖 link: 路径 + 追加 bundle 条目
             （保留所有无关字段，UTF-8 无 BOM）
7. 同步      cmd.exe /d /v:off /s /c "…dsh.cmd plugin --profile desktop install"
8. 验证      回读 node_modules\@local\dsh-ws-helper-preset\cordis.patch.yml，
             比对 ExpectedPresetSha256；不符 → 失败
9. 收尾      禁用重复的独立 fujiang 注入；可选启动 DSH（带上所选 DSH_HOME）
```

全程日志落 `%LOCALAPPDATA%\DSH-Fujiang-Installer\logs\`。

---

## 常见问题

**装完新会话里没有「工作助手」**
完全退出 DSH（含托盘）再开。预设注册表在进程启动时读取，热装不会即时出现。

**安装器报「找不到随 DSH Desktop 安装的 CLI」**
你选中的 EXE 不是桌面端主程序，或者选到了 `dsh.cmd`。选 `DeepSeek Harness.exe`。

**安装器报「请完全退出 DSH Desktop 后再安装」**
任务管理器里结束 `DeepSeek Harness.exe` 后重试。

**依赖同步失败**
配置已写入但没装成链接。修正网络/权限后**重新点一次安装**即可（会再次备份）。日志里有 CLI 原始输出。

**路径里有中文、空格、`&`、`%`、括号**
1.0.2 起已专门处理并纳入测试（见 `scripts/test-installer.ps1`），可以正常安装。

**能不能只装预设、不装技能**
可以。删掉 `payload\skills` 后再运行安装器，预设照样工作，只是没有技能目录可挂。

**会不会影响我已有的其他插件**
不会。安装器只 upsert 它自己那一条依赖和 bundle 条目，其余字段原样保留（`scripts/test-installer.ps1` 里有「保留无关 JSON 字段」的用例）。

---

## 边界

- 只改**当前用户**的 `DSH_HOME`，不写 DSH 程序目录，不请求管理员权限。
- 不关闭 DSH 的沙箱、审批栈或工具权限。
- 不含 DSH 程序本体；你需要自行安装官方 DeepSeek Harness Desktop。
- 预设改变的是**提示词与回答尺度**，宿主侧的工具能力、沙箱与审批仍由 DSH 自己决定。

---

## 许可

[MIT](LICENSE)。随意改、随意分发，保留版权声明即可。

第三方技能文本的出处与许可状态未逐一追溯，如你是某个技能的作者并希望调整署名或移除，请开 Issue。
