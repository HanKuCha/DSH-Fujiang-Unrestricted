# fujiang-pojia 对照与同步

核对日期为 2026-11-16。本项目版本为 1.3.1。

## 来源与版本

原地址 `FJNB5/fujiang-pojia` 当前返回 404。公开快照保留了 0.20.13 的提交 `338b598386aed60d4e7bdbf60ebb526af0b47697`，时间为 2026-11-11。公开材料可以确认该版本的源码与更新记录，最初作者和首版沿革仍有待进一步证据。

本次找到的最新活跃衍生版本为 highstat 的 0.21.0，核对时主分支为 `faabf6c4505b94632c154aaaf1978de20962bc30`。它基于 0.20.13，后续增加英文界面、300 条知识记录、评估引擎、Context7 和 REA 集成。主分支还包含 0.21.0 发布后的提交。

完整 fork 已保存到 [HanKuCha/fujiang-pojia](https://github.com/HanKuCha/fujiang-pojia)。中文 0.20.13 基线另有 [upstream-0.20.13 标签](https://github.com/HanKuCha/fujiang-pojia/tree/upstream-0.20.13)。

## 功能与结构

| 项目 | fujiang-pojia 0.20.13 | DSH-Fujiang-Unrestricted 1.3.1 |
| --- | --- | --- |
| 插件入口 | `@deepseek-ai/dsh-prompt-custom`，宿主与客户端模块 | `@local/dsh-ws-helper-preset`，`ws-helper` 预设与宿主协作模块 |
| 提示词 | 输入区开关、编辑面板，支持追加与替换，配置存于 `prompt-custom.json` | 固定工作助手预设，角色与协作规则共同组合 |
| 技能 | 按需下载 REA 与 AboutSecurity，九类内置知识技能 | 随包 240 个技能与三个协作技能 |
| 知识与报告 | 内置 CVE / PoC、匹配、报告存储、任务编排工具 | 通用工作助手，通过现有技能和工具完成工作 |
| 沟通 | 提示词与任务流程指引 | 补回应流处理、插话目标纠正、澄清与阶段汇报 |
| 任务进度 | 单独 campaign 状态和自动续跑 | DSH 原生 todo_write，按执行证据逐项更新与收尾核对 |
| 安装 | PowerShell 脚本 | 内嵌 payload 的 Windows EXE，附 DSHA 独立包 |

两项目的历史和结构应按各自代码理解。名称相同本身不足以证明直接继承关系。0.20.13 的更新记录也没有给出模型能力提升或拒答率的对照评测。

## 0.20.13 更新与移植结果

| 更新 | 1.3.1 的处理 |
| --- | --- |
| 隐藏免责声明时释放键盘监听，修复 Enter、Shift+Enter、Esc | 完整源码与修复保存在 fork 的原版标签中。当前工作助手的 UI 使用 DSH 原生预设选择器 |
| 输入法组合事件保护 | 同上，属于免责声明组件 |
| 从进程、注册表、快捷方式、默认位置与 PATH 识别安装位置 | 已移植至 C# 安装器。检测到的目录同时校验桌面程序与随附 CLI |
| 接受安装目录、EXE、CLI 路径 | GUI 输入框与静默入口均接受三种 Desktop 路径。程序目录和 DSH_HOME 分别解析 |
| 安装与键盘回归测试 | 复跑原版测试，并为当前 EXE 增加路径、真实快捷方式、目录入口与独立 EXE 回归 |

本次主项目合并范围为 0.20.13 适用的安装兼容修复。完整面板、知识库和任务编排功能位于独立 fork。主项目的工作助手预设、通信、清单同步与子代理兼容模块继续使用 `.coop.7`，payload 文件哈希与 1.3.0 相同。

需要特别留意两处整合冲突。原版的替换模式会注册人格前后缀，可能覆盖工作助手的协作规则。其自动续跑消息使用 `source.kind = 'user'`，接入当前协作模块时可能被当成人类插话。完整插件的共存适配需要分别处理这两处行为。

## 验证范围

本次在本机 Windows 下复跑原版键盘生命周期和安装路径回归，安装路径覆盖 Windows PowerShell 5.1 与 PowerShell 7。当前安装器验证使用隔离 profile 和模拟 CLI，并另行验证真实 Desktop CLI 的依赖链接，以及原生运行时的工作助手创建、补回应和清单处理。

中文、空格及特殊字符路径通过隔离夹具验证，快捷方式通过 Windows COM 创建和读取。实际 D/E 盘安装、其他用户电脑、Android 真机仍需相应设备验收。对模型回答质量的判断需要真实任务对照，本次兼容修复的测试结果仅覆盖列出的工程行为。

上游更新记录见 [0.20.13 CHANGELOG](https://github.com/HanKuCha/fujiang-pojia/blob/upstream-0.20.13/CHANGELOG.md)。后续衍生版本见 [0.21.0 CHANGELOG](https://github.com/HanKuCha/fujiang-pojia/blob/faabf6c4505b94632c154aaaf1978de20962bc30/CHANGELOG.md)。
