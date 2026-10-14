# 官方 Codex 面板同步

0.4.0 提供 Windows 原型：手机 `/new` 在官方面板显示运行进度，完成后可在电脑继续同一线程。手机续聊、fork 和运行中接管仍是独立的后续目标。

首次在配置页选择 **启用官方 Codex 同步**，确认保存原入口，结束现有桌面任务后重载 VS Code。连接 QQ 后自动出现配对码，手机发送 `/pair CODE`，电脑一次确认真实 OpenID 与项目授权。之后 `/new` 自动打开新会话；**打开官方 Codex 会话** 可再次定位最近一条。关闭面板不等于取消，取消仍可用 QQ `/cancel`。

## 已核对的接口

2026-10-14 核对 OpenAI 官方文档与公开安装载荷：

- Codex CLI **0.162.0-alpha.17.2**，官方扩展 `openai.chatgpt` **26.51007.21434**，Windows VS Code **1.141.0** / Node **24.21.0**。
- [App Server](https://learn.chatgpt.com/docs/app-server)：每条连接独立 initialize；WebSocket 帧为 JSON-RPC；原生 capability-token 在握手时核验 Bearer；`thread/resume` 加入同一个后端内的运行线程。不同进程不能绕过已有 active writer。
- 对该 CLI 在隔离 home 生成稳定与 `--experimental` JSON schema。共享线程使用 `capabilities.experimentalApi: true` 和 `historyMode: paginated`，兼容官方面板的 `thread/turns/list`、`thread/items/list`，不改变认证、模型或权限。
- [IDE 命令](https://learn.chatgpt.com/docs/ide/commands)及公开扩展代码：`chatgpt.openSidebar`、`chatgpt.cliExecutable`、URI handler 与 `/local/:conversationId`。通过 VS Code 公共 `vscode.open` 导航；没有使用扩展私有导出 API、模拟审批点击或修改官方扩展文件。

前期认证 WebSocket 实验证明共享后端可实时同步；最终实现使用原生 stdio 和本插件认证的本机通道。分页历史字段仍为精确 schema 中的实验能力。这是锁定版本的开发原型，不声明其他官方扩展版本兼容。

## 连接与生命周期

官方扩展经本插件生成的原生 Windows 启动器，拥有一个原生 stdio 后端。代理只监听 `127.0.0.1`，采用 256 位随机令牌和常量时间比较完成认证。AnyDevice 手机任务经认证本机代理复用同一条原生 stdio 连接。令牌不在命令行、页面、诊断、Git 或 QQ 中；启动参数不含令牌。不同 VS Code 扩展宿主使用各自 PID 的连接描述，不跨窗口接管。

生成目录位于 AnyDevice 独立 globalStorage，使用仅当前 Windows 用户可访问、禁用继承的 ACL。VSIX 只含审查过的 C# 源码；启用时用 Windows .NET 编译器生成隐藏运行的 exe。恢复按钮只恢复本插件仍然拥有的 `chatgpt.cliExecutable` 原值；手工修改后的值不被覆盖。**卸载前先恢复原入口并重载**。工作区覆盖该设置时拒绝启用，不修改项目 `.vscode/settings.json`。

创建共享新线程后在内存登记写入占用，打开官方面板并确认它请求了该线程，再提交模型任务。空线程尚未物化时暂缓桌面读取，原生 turn/started 后转发，避免丢失开头事件或出现空 rollout 错误。运行中恢复请求不能覆盖手机线程的沙箱、模型和审批策略。官方面板的并发新轮次和运行中取消订阅被拒绝，切换面板时保留手机的原生事件订阅；原生中断仍可使用。手机请求审批仅进入 AnyDevice 的准确匹配电脑确认框，官方代理不会给同一请求提供第二个批准入口。其他桌面线程的请求保留官方处理。

QQ 断开只中断该手机轮次、关闭其连接，不结束桌面后端或无关任务。手机断连时准确中断自己的轮次；原生最终事件到来之前保留占用并拒绝另一条手机连接，不重放任务。官方扩展关闭时结束自己拥有的后端；描述与令牌删除。连接描述只含本机地址、随机令牌和程序路径；native IDs、审批路由、写入占用与事件仍只在内存，不读取登录文件。

## 验证范围

合成验收使用独立 CODEX_HOME、项目、官方安装载荷、带认证的本机 Responses 模拟服务和两条客户端连接；不调用真实模型。记录运行中 DOM、最终 DOM、原线程后续请求、准确取消及桌面后端存活。具体通过/跳过项与最终包校验值见 [验证记录](https://github.com/Young581/codex-anydevice/blob/main/docs/verification.md)。QQ 真机、ChatGPT/API 真实模型任务、Linux/macOS 原生启动器及浅色主题不由合成宿主或 CI 结果替代。
