# v1.3.1

对照 fujiang-pojia 0.20.13，同步适用于当前 Desktop 安装器的路径识别改进。

- 自动检测按运行进程、注册表、开始菜单或桌面快捷方式、默认目录与 PATH 的顺序查找。注册表补充 DisplayIcon 和 App Paths。
- 安装输入支持程序目录、DeepSeek Harness.exe 和随附的 dsh.cmd，并校验 Desktop 程序与 CLI 是否完整。
- GUI 与静默入口共同使用路径解析逻辑，程序目录与 DSH_HOME 分别处理。
- 安装日志读取实际程序集版本，便于定位版本问题。
- 新增路径与真实 Windows 快捷方式回归。原版键盘和安装测试同时复跑。

工作助手 payload 继续使用 `.coop.7`。补回应、插话纠正、逐项清单进度和子代理兼容模块通过原生运行时回归。DSHA 包沿用共享预设与手机适配入口，手机端工程行为的验证范围见 mobile/README.md。

验证通过 54 项隔离安装检查、8 项原生会话与清单检查、13 项原生补回应检查、真实 Desktop CLI 依赖链接、手机包结构和旧/新工具入口测试。原版 10 项键盘检查及 20 项安装路径检查也通过，后者分别在 Windows PowerShell 5.1 和 PowerShell 7 运行。原生回归使用模型夹具，网络模型调用数为零。

本次验收环境为 Windows 与 DSH 0.2.2-rc.1。其他用户电脑、实际 D/E 盘安装和 Android 真机需要对应设备进一步验收。

完整上游已 fork 到 [HanKuCha/fujiang-pojia](https://github.com/HanKuCha/fujiang-pojia)。本次主项目的同步范围与功能差异见 [上游对照](https://github.com/HanKuCha/DSH-Fujiang-Unrestricted/blob/main/docs/upstream-sync.md)。
