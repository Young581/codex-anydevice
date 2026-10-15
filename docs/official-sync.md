# 官方 Codex 面板同步

0.6.0 提供 Windows 原型：手机 `/new` 在官方面板显示运行进度，完成后可在电脑继续同一线程；手机也可切换已授权项目、查看历史和继续当前项目的空闲原线程。fork 和运行中接管仍是后续目标。

首次在配置页选择 **启用官方 Codex 同步**，确认保存原入口，结束现有桌面任务后重载 VS Code。QQ 配对一次后记住 OpenID 与项目授权；旧版保存的身份可直接在电脑确认并记住。之后 `/new` 自动打开新会话；`/sessions` → `/use 1` → `/continue 内容` 继续已有原线程，电脑 **选择续聊会话** 也可设置目标。**打开官方 Codex 会话** 可再次定位最近一条。关闭面板不等于取消，取消仍可用 QQ `/cancel`。

## 已核对的接口

2026-10-14 核对 OpenAI 官方文档与公开安装载荷：

- Codex CLI **0.162.0-alpha.17.2**，官方扩展 `openai.chatgpt` **26.51007.21434**，Windows VS Code **1.141.0** / Node **24.21.0**。
- [App Server](https://learn.chatgpt.com/docs/app-server)：每条连接独立 initialize；WebSocket 帧为 JSON-RPC；原生 capability-token 在握手时核验 Bearer；`thread/resume` 加入同一个后端内的运行线程。不同进程不能绕过已有 active writer。
- 对该 CLI 在隔离 home 生成稳定与 `--experimental` JSON schema。共享线程使用 `capabilities.experimentalApi: true` 和 `historyMode: paginated`，兼容官方面板的 `thread/turns/list`、`thread/items/list`，不改变认证、模型或权限。
- [IDE 命令](https://learn.chatgpt.com/docs/ide/commands)及公开扩展代码：`chatgpt.openSidebar`、`chatgpt.cliExecutable`、URI handler 与 `/local/:conversationId`。通过 VS Code 公共 `vscode.open` 导航；没有使用扩展私有导出 API、模拟审批点击或修改官方扩展文件。

前期认证 WebSocket 实验证明共享后端可实时同步；最终实现使用原生 stdio 和本插件认证的本机通道。分页历史字段仍为精确 schema 中的实验能力。这是锁定版本的开发原型，不声明其他官方扩展版本兼容。

## 连接与生命周期

2026-10-14 获取 [IDE 设置](https://developers.openai.com/codex/ide/settings)与 [App Server](https://developers.openai.com/codex/app-server)，并核对上述确切版本的公开 stdout JSONL 解析器：官方默认缓冲阈值为 256 MiB，超过时切换流式解析。0.4.0 代理错误地对桌面历史也使用手机通道的 1 MiB 上限，超限会退出并关闭后端。0.4.1 将两条原生 stdio 方向的单条消息硬上限设为 256 MiB（同时受 Node 字符串长度限制），按记录而非整个数据块计数；手机认证通道保留 1 MiB 限制。代理仍使用完整 JSON 解析，超过其硬上限的桌面消息仍会断开，不能将官方缓冲阈值等同于官方消息大小上限。

升级到 0.6.0 后，点 **更新官方同步入口** 并重载，确保替换生成目录里的旧代理，同时保留原入口备份。仅更新 VSIX 不会刷新已生成的入口载荷；如果官方面板无法启动，可先 **恢复原 Codex 入口** 并重载，再重新启用。

官方扩展经本插件生成的原生 Windows 启动器，拥有一个原生 stdio 后端。代理只监听 `127.0.0.1`，采用 256 位随机令牌和常量时间比较完成认证。AnyDevice 手机任务经认证本机代理复用同一条原生 stdio 连接。令牌不在命令行、页面、诊断、Git 或 QQ 中；启动参数不含令牌。不同 VS Code 扩展宿主使用各自 PID 的连接描述，不跨窗口接管。

生成目录位于 AnyDevice 独立 globalStorage，使用仅当前 Windows 用户可访问、禁用继承的 ACL。VSIX 只含审查过的 C# 源码；启用时用 Windows .NET 编译器生成隐藏运行的 exe。恢复按钮只恢复本插件仍然拥有的 `chatgpt.cliExecutable` 原值；手工修改后的值不被覆盖。**卸载前先恢复原入口并重载**。工作区覆盖该设置时拒绝启用，不修改项目 `.vscode/settings.json`。

创建共享新线程后在内存登记写入占用，打开官方面板并确认它请求了该线程，再提交模型任务。空线程尚未物化时暂缓桌面读取，原生 turn/started 后转发，避免丢失开头事件或出现空 rollout 错误。运行中恢复请求不能覆盖手机线程的沙箱、模型和审批策略。官方面板的并发新轮次和运行中取消订阅被拒绝，切换面板时保留手机的原生事件订阅；原生中断仍可使用。手机请求审批仅进入 AnyDevice 的准确匹配电脑确认框，官方代理不会给同一请求提供第二个批准入口。其他桌面线程的请求保留官方处理。

官方面板初次挂载可能晚于 URI 导航；0.5.1 在原有 20 秒等待内每 1.5 秒重试公开会话导航，仍需后端确认准确线程已被桌面请求，不能用定时等待代替加入证据。超时返回 `syncNotReady`，不提交模型任务。

QQ 断开只中断该手机轮次、关闭其连接，不结束桌面后端或无关任务，持久配对不清除。手机断连时准确中断自己的轮次；原生最终事件到来之前保留占用并拒绝另一条手机连接，不重放任务。官方扩展关闭时结束自己拥有的后端；描述与令牌删除。连接描述只含本机地址、随机令牌和程序路径；所选线程 ID 保存在配置，其他 native IDs、审批路由、写入占用与事件只在内存，不读取登录文件。

## 手机继续已有会话

0.6.0 的 `/sessions next` 使用原生游标翻页，`/history [编号|next]` 与电脑历史按钮每页先核对项目元数据，再用 `thread/turns/list` 读取用户/Codex 文字。过滤后的最多 1400 字符页面才经过手机通道，不恢复线程或调用模型。历史查看可能将过去的敏感对话传到 QQ，请按需操作。目录可在工作区之外，由电脑选择并逐目录授权；手机仅能按已授权编号切换。详见[配置说明](setup.md)。

仅在共享官方后端中支持。列表限定精确项目 cwd、最近 10 条且不读 turns；选择及执行前均重查空闲与可直接输入状态。代理预留线程后再 `thread/resume`，并拒绝正在运行或尚未返回提交结果的桌面轮次。恢复只按 ID，不接受路径、history 或 fork；不覆盖原线程模型，不请求更高沙箱权限，保留只读限制并核对 on-request/user。恢复同样检查桌面加入状态；对已缓存的线程，接受本次共享后端中此前成功桌面读取的准确 ID 证据，成功取消订阅、归档或删除后撤销该证据，最多保留 1024 条。未有证据则等待新读取，不将手机自己的恢复视为桌面已加载。

2026-10-15 用精确 CLI 重新生成实验 schema，核对 `thread/list`、`thread/read`、`thread/resume`。其中 resume 支持 `excludeTurns`，没有 `historyMode`；仅新线程 start 使用分页历史字段。重新获取 OpenAI 页面本轮失败，采用前轮官方文档、当前生成 schema 与隔离实际后端验证交叉核对；QQ 单聊事件页面本轮获取成功。

## 验证范围

合成验收使用独立 CODEX_HOME、项目与带认证的本机 Responses 模拟服务；不调用真实模型。`scripts/verify-continuation.js --codex <绝对路径>` 验证真实后端原 ID/历史上下文、手机运行期间拒绝电脑并发、取消、桌面恢复与错误令牌拒绝，桌面 stdio 前端由脚本模拟。0.4.1 的 GUI 重跑曾停在 `syncNotReady`；本轮复查也观察到空白 webview 与导航时机问题。0.5.1 源码已通过扩展后的真实官方 GUI 流程：实时进度、电脑同线程续聊、手机恢复同一线程、取消后再次续聊；使用固定版本官方扩展和合成模型，不代表真实账号验收。具体通过/跳过项见 [验证记录](https://github.com/Young581/codex-anydevice/blob/main/docs/verification.md)。QQ 真机、ChatGPT/API 真实任务、Linux/macOS 原生启动器及浅色主题仍需分别验收。
