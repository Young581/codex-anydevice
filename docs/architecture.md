# 架构与控制边界

0.3.2 已实现个人 QQ 官方 WebSocket 与 Codex 新线程原型，实际账号、手机与模型任务待验收。

```mermaid
flowchart LR
  Phone[本人 QQ 私聊] --> QQ[QQ 官方接口]
  QQ --> Client[qq-client 鉴权与连接]
  Client --> Control[direct-controller 配对/授权/去重]
  Control --> Native[codex-session 本地 stdio]
  Native --> Codex[Codex 新线程与沙箱]
  Codex --> Project[授权项目]
  VSCode[VS Code 原生确认] --> Control
  Codex --> Native --> Control --> Client --> QQ --> Phone
```

## 模块与生命周期

| 模块 | 责任 |
| --- | --- |
| setup-controller / setup-model | 向导、SecretStorage、项目与配置变更撤销 |
| qq-client | token、单分片 WSS、C2C、心跳/ACK、Resume、刷新、有界重试和被动回复 |
| direct-controller | 配对、电脑授权、串行队列、匿名去重、单任务、取消与审批 |
| codex-session | 精确版本、stdio、独立线程/轮次、有效策略检查、准确请求匹配与中断 |

激活不自动连接或读取密钥，不重放任务；用户授权后连 QQ，`/new` 才启动拥有的子进程。每个任务一个新线程，不读取或接管旧线程。退出、重载、断开或终止连接失败撤销验证、停止拥有的进程并标记未知结果。Windows 按创建的子进程 PID 清理其进程树。

同一 OS 用户下，用 AppID 派生的 loopback 端口跨窗口占用，监听立即销毁入站连接，不提供控制接口或数据。OS 在进程退出时释放；碰撞或其他端口占用保守拒绝。

## 身份、项目与去重

只处理外层 C2C 私聊身份，禁用群聊与引用身份。8 位随机十六进制代码 5 分钟、最多 5 次、一次性并经电脑确认。一个 OpenID，持久登记不等于内存验证；重启和主动断开重新配对。修改机器人、身份、项目、Codex 路径先撤销连接。

项目从当前本地工作区明确选择并核对真实目录，执行和审批前重查。手机不传路径，任务正文是模型输入，不能用命令文本解析替代原生沙箱。所选目录不是完整读取边界。

消息队列最多 32，执行独立于队列，运行中可响应状态/取消。一个控制器一个活跃任务，一个新线程一个写入者。执行前持久保存 SHA-256(AppID、sender、messageID)，最多 512 条；淘汰推进时间截断，旧事件保守拒绝。保存失败停止接收；重启活跃状态为 unknown，不重放。该日志不是文件事务或恰好一次执行保证。

日志仅含哈希、时间、最近随机任务 ID/状态，以及白名单中的错误类别和任务阶段，无原始身份、目录、prompt、结果、原始错误正文或 native IDs。状态为 starting/running/waitingApproval/cancelling/completed/failed/cancelled/unknown；中断确认前不宣称取消或回滚完成。明确尚未发起 turn/start 或收到该请求的 JSON-RPC 拒绝可记 failed；提交后的连接中断保留 unknown。

## 原生策略与审批

锁定 **0.162.0-alpha.17.2**，使用 `on-request` 与 `approvalsReviewer: user`，继承 CLI 认证、模型和服务商。请求单项目 workspace-write、工具网络关闭及临时额外写入关闭；核对返回有效策略才发起轮次。更严格 readOnly 保留并提示，其余不匹配拒绝。精确证据见[原型](qq-direct-poc.md)。

请求精确绑定 requestId/threadId/turnId/itemId 与原生 startedAtMs，最多 2 分钟。电脑显示完整有界请求，仅 accept/decline，不自动审批、会话批准或持久规则。已解决、过期、结束、取消、配置变化的窗口不能允许其他请求。

缺少内容的文件审批、会话 grantRoot、终端输入、权限工具、动态工具、MCP elicitation 与提问等未实现请求拒绝或停止，不伪装成功。结果仅取 agentMessage 完成事件，最新最多 20,000 字符留内存，QQ 返回摘要。固定诊断阶段为版本、初始化、线程、轮次提交及等待结果；error 和 turn/completed 的 codexErrorInfo 只映射为固定类别，不保存 message/additionalDetails。重试中的通知不提前终止任务。失败类别与阶段在桌面、QQ 最终回复和 /status 中显示，重载后从匿名记录恢复；旧执行的诊断也核对 epoch 与 operation。

## 渠道边界

REST 与 token 固定使用腾讯文档的 `api.bot.qq.com`。Gateway 仅接受 `api.bot.qq.com`、官方 SDK 使用的 `api.sgroup.qq.com` 两个确切主机，协议为 WSS、标准端口、路径为 `/websocket` 或 `/websocket/`，无用户信息、查询参数或片段；不接受任意 QQ 子域或手填替代地址。拒绝 HTTP 凭据重定向，地址失败仅展示 transport/host/path/options 类别，不展示原地址或服务端错误正文。官方固定版本证据见[直连原型](qq-direct-poc.md)。单分片，最多 6 次连续恢复尝试；无 ACK 重连，token 到期前刷新。回复使用 msg_id/msg_seq，保守 5 分钟与最多 4 次，不盲目重试或提供主动额度回退。

电脑持续运行；Webhook、多分片、微信、远程宿主和后台服务后续独立开发。`Young581.codex-anydevice`、`codexAnyDevice.*` 与存储独立，不修改 Beacon 的设置、Hook、证书或缓存。日志观察、fork、原线程续聊与运行中接管分别验收。
