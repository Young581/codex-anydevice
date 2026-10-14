# QQ 官方直连原型与证据

0.3.0 实现 **QQ 官方 WebSocket → AnyDevice → 本机 Codex app-server**，无需 OpenClaw 或公网回调。真实账号权限、手机与模型执行待验收。

## 2026-10-14 核对

实际获取官方[鉴权](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/api-use.html)、[连接与事件](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)、[C2C](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/c2c_message_create.html)与[发送私聊](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html)。使用 api.bot.qq.com token、QQBot、gateway/bot、文档的 WSS、1 << 25、外层 d.author.user_openid 和 v2/users/{openid}/messages。回复文档同时出现 60 分钟/5 分钟，本版保守取 5 分钟及最多 4 次。

实际获取 [OpenAI App Server Markdown](https://learn.chatgpt.com/docs/app-server.md)，以安装的 **0.162.0-alpha.17.2** 在隔离 CODEX_HOME 生成 JSON Schema，核对初始化与新线程返回；不调用模型。

| 项目 | 精确证据 |
| --- | --- |
| thread/start | sandbox 的 wire 字符串为 workspace-write，返回类型为 camelCase |
| 审批 | Schema 有 untrusted，但运行时拒绝配置 approval_policy = untrusted，提示不再支持；本版使用 on-request/user |
| turn/start | 使用 workspaceWrite 或原生更严格的 readOnly，工具网络关闭 |
| Windows 返回 | 隔离环境请求 workspace-write 后返回 readOnly；只确认行为，未确定具体原因，也未调用系统 setup |
| 审批请求 | commandExecution/fileChange requestApproval，准确 accept/decline；resolved 作废旧弹窗 |
| 取消 | turn/interrupt 精确 thread/turn，turn/completed 提供最终状态 |

网页示例与 alpha 版本字符串不同，不直接复制另一版本的 unlessTrusted/workspaceWrite 到 thread/start。新增版本先生成 schema、做隔离策略与审批验收，再更新支持矩阵。

原生权限降低时保留限制。官方 app-server 文档列出 windowsSandbox/setupStart，本版不调用系统设置接口；用户需通过官方 Codex 设置。单独 Windows 使用页面本轮网络超时，不作为已读取证据。

## 验收

按[使用说明](setup.md)在无秘密项目连接、配对，用 `/new` 读取 README，再验收一个写文件任务。分别记录 ChatGPT 和 API Key 的实际请求，自定义服务商另行核验。检查本人/非法身份、群聊、重复消息、过期配对、电脑拒绝、取消、断网恢复、重载未知状态、过期/已解决审批与多窗口占用。

不自动批准、模拟点击或移除认证来通过测试。合成和宿主结果见[验证记录](verification.md)，普通 CI 不访问真实 QQ 或付费模型。
