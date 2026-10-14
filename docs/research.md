# 手机操控 Codex：调研与选型

调研日期：2026-10-13。结论依据实际读取的公开文档；本轮没有安装 OpenClaw、创建腾讯机器人、登录微信或执行真实 Codex 任务。账号准入、地区可用性、消息额度和实际运行效果仍须验证。

选型更新：用户希望减少个人使用的安装步骤，默认路线已改为 **QQ 官方机器人 → AnyDevice → 本机 Codex app-server**。OpenClaw 保留为调研比较，不属于新版向导的依赖；旧的 OpenClaw 步骤不是当前安装要求。

0.3.1 实现与 2026-10-14 精确协议证据见[直连原型](qq-direct-poc.md)，下文为选型依据；真实账号和模型任务未验收。

## 结论

“QQ/微信”是手机消息渠道，“龙虾”按 **OpenClaw** 理解，它是连接消息渠道与执行代理的自托管网关，两者可以组合。

当前选择 **QQ 官方机器人直连 AnyDevice** 验证新任务链路。扩展自行处理鉴权、连接恢复、发信人授权、去重、执行状态与回传。微信单独研究可用官方接入能力；已有会话交接继续按独立里程碑验证。

OpenClaw 能复用渠道插件、代理路由、命令和审批管理，适合多平台和多代理部署；个人单 QQ 项目暂不采用。直连降低用户配置步骤，同时增加本项目需要维护的机器人协议代码；普通任务指令无需第二个模型来转述。

## 方案比较

| 方案 | 文档确认的能力 | 部署与限制 | 建议 |
| --- | --- | --- | --- |
| QQ 官方机器人直接接 Codex | 官方支持单聊、群聊、频道；事件支持 WebSocket/Webhook [3][4] | 需要开放平台创建机器人、AppID/AppSecret；自行维护重连、鉴权、消息路由、限流和审批；账号具体权限待后台确认 | **当前默认路线**，先验证个人私聊 |
| QQ + OpenClaw | 可下载 QQ 插件；单聊与群 @；官方 QQ 网关；命令和审批授权有独立控制 [5] | 需要运行 OpenClaw 与 Codex；具体发信人与审批者使用 OpenID；不能以显示昵称授权 | 调研备选，不进入当前用户安装流程 |
| 微信 + OpenClaw | 腾讯微信团队维护 `@tencent-weixin/openclaw-weixin`；扫码登录；私聊与媒体 [6] | 文档只声明私聊；2.4.8 的标准配对与撤销权限存在限制；需要核实修复版本和运行时行为 | 渠道研究参考，不进入当前安装流程 |
| 企业微信自建应用 | 官方有应用消息发送接口 [10] | 需要企业配置；接收消息、回调加解密、网络配置另行验证；发送接口本身不能证明双向操控 | 面向团队的备选 |
| 手机网页控制台 | 自建客户端可使用官方 app-server 的会话、流式事件和审批能力 [1] | 需要认证和私有连接；不能直接暴露未经认证的 app-server WebSocket；手机端 UI 需开发 | 后续提供不依赖聊天渠道的入口 |
| 个人 QQ/微信非官方客户端自动化 | 本轮未验证稳定、公开的通用官方个人客户端操控接口 | 自动化登录、协议模拟、界面点击易受版本与账号策略影响 | 不作为第一版基础 |

微信可用不代表“任意个人微信都可以直接被脚本控制”。本报告确认的是文档列出的腾讯 OpenClaw 微信渠道插件。不要把旧的“微信只能接企业微信”结论直接套到当前文档。

## Codex 的控制接口

[官方 OpenAI 文档][1]说明 `codex app-server` 用于深度客户端集成，覆盖认证、历史、审批和流式事件，VS Code Codex 扩展也使用这一接口。默认 stdio 是按行传输的双向 JSON 消息；线上报文省略 `jsonrpc` 字段。

典型流程为 `initialize` → `initialized` → `thread/start` → `turn/start`；续聊使用 `thread/resume`，复制历史为新分支使用 `thread/fork`，终止当前轮使用 `turn/interrupt`。审批属于服务端请求，需要对应请求 ID 的明确响应。提问和异步提问须分别处理，不能把提醒日志当作可回复的控制通道。

文档将 app-server 命令及 WebSocket 传输列为实验能力，并明确远程连接须配置认证和 TLS。原型优先由本机网关调用 stdio，把手机通信交给已认证的消息渠道。后续若开发自有远程控制台，需要额外验证实验接口的版本与认证。

[Codex SDK][2]适合脚本和自动任务，可以开始、继续和恢复会话。需要丰富历史、交互审批和流式事件时，优先 app-server。当前文档已说明旧 `codex mcp-server` 路径被移除，不采用旧文章中的 MCP Server 方案。

Codex 登录和付费由所选运行时与账号承担；订阅登录与 API 计费不是同一条路径。方案不承诺免费、特定模型权限或额度。

## OpenClaw 已经具备哪些能力

当前文档列出原生 `@openclaw/codex` 插件 [7]。它通过 Codex app-server 执行，原生会话延续由 Codex 负责，渠道和可见结果由 OpenClaw 负责。`/codex bind`、`/codex threads`、`/codex resume`、`/codex stop`、`/codex steer` 等命令见[命令文档][8]。需要校验当前账号是否有 owner 或相应管理员权限。

当前原生 Codex 路径与显式 ACP 外部执行路径不同；不把旧 `acpx` 接法当作唯一实现。普通对话新建后应确认实际使用的是 Codex harness，而非 OpenClaw 的另一个执行后端。

[监督会话文档][9]列出 CLI、VS Code 等原生来源会话。已有会话可见、能分支继续、能写回原会话、能接管运行中审批是不同能力：

- 本地已保存或空闲会话的普通监督路径可创建快照分支；新分支不等于原会话被接管。
- 正在执行的来源会话不能随意分支或归档。
- `/codex resume` 首次附着存在 stdio、agent home、空闲状态和动态工具目录等条件 [8]。
- 共享用户 Codex Home 的文档明确要求不同托管 stdio 进程不能并发写同一线程；macOS/Linux 的共享 Unix socket 是另一种部署模式 [11]。
- [审批与提问文档][12]定义精确请求匹配、超时取消和明确允许/拒绝；具体 QQ/微信渠道上的交互仍需实机验证。

因此，第二阶段先交接**空闲**会话。运行中桌面会话接管需要共享 app-server 连接及所有权实验，尤其 Windows 环境不能照搬 Unix socket 指令。

## 新插件的产品边界

Codex Beacon 主要观察任务状态并提醒，AnyDevice 将提供主动指令入口，应拥有独立名称、设置命名空间、凭据与任务存储。可以保留相似的项目分组、状态含义、双语界面和发布纪律；不把 Beacon 的通知 Hook 改造成隐式审批器。

优先补齐：选择允许远程访问的项目、返回任务 ID 与状态、把手机会话绑定到明确项目与原生 thread、失败/断连/取消状态、桌面与手机交接提示。第一阶段仅私聊文字指令，群聊、附件、语音与多机器稍后加入。

## 接入前需要验证的具体事项

| 事项 | 验收证据 |
| --- | --- |
| QQ 注册与授权 | 目标账号能创建机器人，并与允许的 OpenID 实际私聊 |
| 原生 Codex 执行 | 手机任务在指定合成项目运行，返回 native thread/turn ID；没有回退至其他后端 |
| 去重与恢复 | 重复消息、网关重启和模糊执行结果不导致重复修改 |
| 提问与审批 | 非授权人、旧请求、跨会话答复被拒绝；允许/拒绝和超时行为正确 |
| 微信 | 锁定插件/网关版本，确认私聊、扫码、撤销权限；复测文档中的 2.4.8 问题 |
| 会话交接 | 说明原 thread 延续还是 fork；活跃线程互斥；不损坏已有对话 |

参见[直连原型步骤](qq-direct-poc.md)、[架构](architecture.md)及[路线](roadmap.md)。[OpenClaw 原型步骤](https://github.com/Young581/codex-anydevice/blob/main/docs/openclaw-poc.md)仅保留为历史备选研究，不再打包进扩展。

## 来源

均于 2026-10-13 实际读取。OpenAI 原 developers.openai.com 链接目前重定向到下面的官方 ChatGPT Learn 文档；引用使用最终页面。文档描述不等于本项目已验收。

1. [OpenAI：Codex App Server](https://learn.chatgpt.com/docs/app-server)
2. [OpenAI：Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)
3. [QQ 官方：启动接入](https://bot.q.qq.com/wiki/develop/api-v2/)
4. [QQ 官方：事件订阅与通知](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)
5. [OpenClaw：QQ bot](https://docs.openclaw.ai/channels/qqbot)
6. [OpenClaw：WeChat](https://docs.openclaw.ai/channels/wechat)
7. [OpenClaw：Codex harness](https://docs.openclaw.ai/plugins/codex-harness)
8. [OpenClaw：Codex commands](https://docs.openclaw.ai/plugins/codex-harness/commands)
9. [OpenClaw：Codex supervision](https://docs.openclaw.ai/plugins/codex-supervision)
10. [企业微信官方：发送应用消息](https://developer.work.weixin.qq.com/document/path/90236)
11. [OpenClaw：Native Codex state and features](https://docs.openclaw.ai/plugins/codex-harness/native-features)
12. [OpenClaw：Codex native permissions and elicitations](https://docs.openclaw.ai/plugins/codex-harness-runtime/permissions)

[1]: https://learn.chatgpt.com/docs/app-server
[2]: https://learn.chatgpt.com/docs/codex-sdk
[3]: https://bot.q.qq.com/wiki/develop/api-v2/
[4]: https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html
[5]: https://docs.openclaw.ai/channels/qqbot
[6]: https://docs.openclaw.ai/channels/wechat
[7]: https://docs.openclaw.ai/plugins/codex-harness
[8]: https://docs.openclaw.ai/plugins/codex-harness/commands
[9]: https://docs.openclaw.ai/plugins/codex-supervision
[10]: https://developer.work.weixin.qq.com/document/path/90236
[11]: https://docs.openclaw.ai/plugins/codex-harness/native-features
[12]: https://docs.openclaw.ai/plugins/codex-harness-runtime/permissions
