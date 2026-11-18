# v1.4.7

修复 DSH 0.2.2 下外部 MCP 工具（如 255 个 REA 工具）在请求装配层未按需裁剪的问题，对齐 DSH 0.2.2 标准预设能力，并增强 Windows 安装器兼容性。工作助手版本更新为 `2.1.3-desktop-coop.22`。

- **修复 DSH 0.2.2 下外部 MCP 工具 Schema 首轮全量泄漏（再省 ~95 KB / ~22k tokens）**：DSH 0.2.2 的 `systemPrompt.assemble()` 直接从 `toolProviders` 采集工具 Schema 而非走 `tools.resolve()`，导致此前开启 REA 后每轮仍会下发全部 255 个 `mcp__fujiang_rea__*` 工具定义。现已在 `tool-discovery.mjs` 的 `assemble` 装配层同步执行按需过滤，首轮仅暴露 `open_binary`、`binary_session`、`inspect_artifact` 三个入口，其余工具通过 `ws_helper_find_tools` 按需激活。连同 `v1.4.6` 的技能库瘦身，新会话首轮输入开销累计缩减超 **80%**。
- **对齐 DSH 0.2.2 标准预设能力（向下兼容 0.2.1 / DSHA）**：为工作助手补齐 `time-context`（实时时间上下文）、`tool-schedule`（定时与周期任务）、`command-goal`（`/goal` 长程目标指令）、`tool-office`（Word/Excel/PPT 原生工具）与 `tool-plugin-manager`，并通过运行时模块存在性守卫确保在旧版宿主上平滑跳过不报错。
- **更新安装器（`1.4.7.0`）**：刷新安装器界面功能摘要文案，并在执行 `dsh.cmd plugin --profile desktop install` 时自动注入 `PNPM_CONFIG_MINIMUM_RELEASE_AGE=0`，防止用户环境中已有插件刚完成热更（未满 24 小时等待期）时触发 pnpm 供应链策略异常阻塞安装。

Windows 下载 `DSH-Fujiang-Installer.exe` 或桌面 ZIP，DSHA 下载 `DSH-Fujiang-DSHA-v1.4.7.zip`。
