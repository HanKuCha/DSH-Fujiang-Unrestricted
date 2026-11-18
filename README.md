# DSH Fujiang Unrestricted

富江 0.20.13 原版功能与可编辑人格，集成收到插话后先回应、再继续任务的协作模块。当前版本为 **1.4.6**，适用于 DeepSeek Harness Desktop 和 DSHA。

1.4.6 将 AboutSecurity 技能库改为真正的按需索引加载（不再于每轮首条请求向 `<available_skills>` 一次性注入全部 262 个子技能描述，首轮省下约 52.6 KB 上下文，同时完整保留 `/` 斜杠面板与 `skill_search` + `skill_read` 按需读取），解除 `skill_read` 的 4,000 字符截断并附带技能目录根路径，同时补齐 DSH 0.2.2 下工作助手 `subagent` 的跨渠道/模型选择与 `list_subagent_models` 支持。

1.4.5 进一步收紧日常问答与选型评估的回复密度（合并结论与定位差异，剔除背景复读与二次收尾总结），并修复补回应旁路请求偶发输出 `<｜｜DSML｜｜>` 工具协议标签的问题；完整保留 1.4.4 的无免责弹窗、去病娇设定、上下文压缩衔接与按需 MCP 工具发现。

1.4.3 恢复本项目旧版默认人格与“自检”回应，结合上游功能面板、知识库和技能管理。补回应继承主助手系统提示词，恢复任务清单实时核对，并补充 REA 参数调用说明。已知旧默认文字会先备份再更新，用户自定义文字按原配置保留。

1.4.2 调整日常回答和最终汇总，默认用一个简短自然段直接说明结果与关键理由，详细分析、表格和清单按用户要求展开。执行过程的沟通提醒会持续带上这一偏好。

1.4.1 增加 REA 6.9 与 WorkBuddy 的 Schema 兼容处理，解决新会话首条消息返回 `11129 invalid_function_parameters`、被网关显示为 503 的问题。处理发生在发给模型的工具说明副本中，REA 的原始参数校验继续生效。

## 功能

- 输入区提供“富江破甲”开关与设置入口。
- 提示词面板支持编辑正文、追加或替换模式、提示词卡片与实际生效预览。保存后的正文在下一次装配生效，开关即时生效。
- 内置知识库含九个分类、167 条记录，可在面板查看、启停，并通过技能目录按需加载。
- 漏洞报告支持持久化保存、严重度筛选、状态更新和 Markdown 导出。
- 任务面板支持创建、绑定会话、阶段进度、目标完成标记和自动续跑。
- 技能面板支持按需安装、启停和删除 REA、AboutSecurity。
- 模型收到真人插话后若直接调用工具，协作模块会先补充可见回应，再继续原调用。用户停止与目标纠正会取消过期的补回应。

面板、知识分类、报告、任务编排与技能管理采用 fujiang-pojia 的中文 0.20.13。默认人格沿用本项目 v1.3.1，集成简短回复要求；补回应继承当前助手的系统提示词，任务清单按阶段核对进度。默认文案位于 `payload/dsh-ws-helper-preset/upstream/default-prompt.json`，可通过提示词面板编辑。

来源、移植改动与验证范围见 [上游同步记录](docs/upstream-sync.md)。完整上游 fork 保存在 [HanKuCha/fujiang-pojia](https://github.com/HanKuCha/fujiang-pojia)。

## 安装

同一个 [最新 Release](https://github.com/HanKuCha/DSH-Fujiang-Unrestricted/releases/latest) 提供桌面与手机附件。

| 平台 | 下载 | 安装方式 |
| --- | --- | --- |
| Windows Desktop | `DSH-Fujiang-Installer.exe` 或桌面 ZIP | 完全退出 DSH 后运行 EXE，选择程序位置与 DSH_HOME |
| DSHA 安卓 | `DSH-Fujiang-DSHA-v1.4.6.zip` | 在 DSHA 插件管理中导入本地包或使用该具体附件链接 |

Windows EXE 内嵌完整插件与知识库，使用系统 .NET Framework 4.8。安装过程通过 Desktop 随附 CLI 注册插件。程序位置可填安装文件夹、`DeepSeek Harness.exe` 或随附的 `resources/runtime/cli/bin/dsh.cmd`，支持自定义磁盘与目录。

安装器会备份 Desktop profile 和原插件目录，沿用 DSH_HOME 内已有的本地维护链接，并校验实际链接的全部发布文件。已有更新版本会触发拒绝降级。首次安装需要先启动一次 DSH，让 Desktop profile 创建完成。

已有有效链接且本插件没有 NPM 运行依赖时，升级会复用经过目录共享校验的链接，直接验证发布文件。首次安装或需要建立链接时调用官方 CLI。

## 使用

1. 启动 DSH，选择“工作助手”，或使用已经启用富江人格的原生模式。
2. 在输入区找到“富江破甲”开关和设置入口。
3. 在提示词页编辑人格，或使用卡片切换正文。
4. 知识库随包提供，技能面板中的 REA、AboutSecurity 按需要下载安装。
5. 在任务面板创建任务并绑定当前会话，随后查看阶段进度与报告。

输入区开关控制上游人格注入。插话回应在工作助手根会话中启用，其他原生模式在富江人格开启时也会得到回应补充。子代理将执行结果交回主代理，由主代理与用户沟通。

补回应沿用当前提供商与模型。模型没有先输出正文时，可能产生一次额外文本请求，相关用量合并记录。生成失败时显示明确的 DSH 状态提示，随后继续原任务。

## 从 1.3.x 升级

运行新版 EXE 即可迁移。当前默认人格改由上游动态注入，提示词编辑和开关可参与现有会话的后续装配。

原有 240＋3 技能与固定人格的挂载由上游分类知识和按需技能管理接替。升级会备份旧插件，原目录中用户自行添加的文件可从备份或旧位置取回。安装器通过 overlay 禁用已知的旧人格插件入口，减少重复注入。

DSH 标准本地技能发现继续读取用户目录和 profile 技能，原先单独安装的 ARTEX 等技能可与上游分类共用。技能面板的安装计数只统计本插件管理的副本。已有 REA MCP 可继续使用，面板安装器会在独立目录安装并注册 `fujiang_rea`。

迁移原有 REA 时，可将原 MCP 的环境变量保存到 `$DSH_HOME/fujiang-skills/rea-env.json`，格式为变量名到字符串值的 JSON 对象。REA 启用时读取这份配置，插件升级保留该文件。

自定义提示词配置保存在 `$DSH_HOME/prompt-custom.json`。已有配置优先生效，首次运行会使用随包默认文案。知识库与技能状态位于 `$DSH_HOME/fujiang-skills`，报告和任务记录位于 `$DSH_HOME/vuln-report`。

自动续跑使用独立的消息来源。绑定任务的流程规则随绑定状态生效，普通会话可继续处理一般工作。忙碌会话会等待后续调度，自动续跑的轮次在实际发送时增加。

## 环境与验证

- Windows 10/11，.NET Framework 4.8，DSH Desktop 0.2.2-rc.1 已进行原生验收。
- 插件声明支持 DSH `>=0.2.1-rc.5 <0.3.0`。不同版本仍需结合宿主兼容性测试。
- 按需安装的外部技能与 REA 引擎具有各自的 Node.js、npm 和系统依赖，面板会显示检测或安装错误。
- DSHA 包结构、模块入口和原生运行时验证使用隔离环境，Android 真机需要对应设备验收。

源代码测试入口为 `scripts/test-installer.ps1`、`scripts/test-runtime.mjs`、`scripts/test-communication.mjs` 和 `mobile/test.cjs`。原生运行时脚本需在 DSH 随附的 Electron Node 模式中运行，并在隔离 DSH_HOME 下创建测试会话。相关行为回归使用模型夹具。

## 构建

```powershell
npm ci
npm run build:mobile
npm run test:mobile
powershell -ExecutionPolicy Bypass -File src/build.ps1
python tools/package-release.py
python tools/package-mobile.py
```

Windows 安装器通过系统 .NET Framework 编译器构建，源码为 `src/DSHInstaller.cs`。桌面与手机共用 `payload/dsh-ws-helper-preset`，手机生成过程转换插件模块名与客户端入口。

## 许可与来源

项目采用 MIT 许可。上游插件、知识库和前端源码的 MIT 声明保存在 `payload/dsh-ws-helper-preset/upstream/LICENSE`，归属与版本说明见 [第三方声明](THIRD_PARTY_NOTICES.md)。
