# v1.4.6

实现 AboutSecurity 渗透技能库真正的 100% 按需加载、解除 `skill_read` 正文截断限制，并修复 DSH 0.2.2 下工作助手子代理无法显式选择模型渠道的问题。工作助手版本更新为 `2.1.3-desktop-coop.21`。

- **AboutSecurity 按需网关索引（首轮目录缩减 ~89.5% / 立省 ~52.6 KB）**：上游原本将全部子技能均标记为 `modelInvocable: true`，导致即便日常非安全对话也会在首轮 `<available_skills>` 中硬塞入近 5.9 万字符的渗透目录。现改为仅向模型目录注册 1 条精简入口 `aboutsecurity-index`，子技能改为 `modelInvocable: false, userInvocable: true`——既保证非安全对话零渗透目录污染、安全任务按需走 `skill_search` + `skill_read` 精准检索，又完整保留 `/` 斜杠菜单与技能选择器的手动点选能力。
- **解除 `skill_read` 4,000 字符静默截断并附带目录根路径**：将 `automation.js` 中 `skill_read` 默认读取长度提升至 `24,000` 字符（上限 `64,000` 字符），修复原 `render` 层硬切前 4,000 字符导致长篇 `SKILL.md` 后半段丢失的问题，并同步返回 `[Base directory: ...]` 以便模型直接读取技能内的 `references/` 附件。
- **补齐 DSH 0.2.2 工作助手子代理模型选择（`modelSelection` / `modelDiscovery`）**：同步支持 DSH 0.2.2 `tool-subagent` 的 `modelSelection: true` 与 `modelDiscovery: true` 配置项（向下兼容 0.2.1），使工作助手下的 `subagent` 工具暴露 `provider` / `model` / `reasoning_effort` 参数及 `list_subagent_models` 查询工具，让子代理模型白名单真正生效。

Windows 下载 `DSH-Fujiang-Installer.exe` 或桌面 ZIP，DSHA 下载 `DSH-Fujiang-DSHA-v1.4.6.zip`。
