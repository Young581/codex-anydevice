# QQ 官方直连原型与证据

0.3.2 实现 **QQ 官方 WebSocket → AnyDevice → 本机 Codex app-server**，无需 OpenClaw 或公网回调。真实账号权限、手机与模型执行待验收。

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

## 0.3.1 网关兼容核对 — 2026-10-14

再次实际获取腾讯[连接说明](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)和[带分片 WSS 接入点](https://bot.q.qq.com/wiki/develop/api-v2/openapi/wss/shard_url_get.html)，网页示例为 `wss://api.bot.qq.com/websocket/`；示例不是网关主机的完整列表。

同步获取腾讯官方 SDK 的固定提交源码：

| 来源 | 确切证据 |
| --- | --- |
| [botpy tests/test_api.py](https://github.com/tencent-connect/botpy/blob/e25f3e84bad7217357d8200a9d12939b58285b84/tests/test_api.py#L175) | `get_ws_url()` 的测试期望为 `wss://api.sgroup.qq.com/websocket` |
| [botpy http.py](https://github.com/tencent-connect/botpy/blob/e25f3e84bad7217357d8200a9d12939b58285b84/botpy/http.py#L90) | 正式 API 主机为 `api.sgroup.qq.com`，sandbox 为另一个明确主机 |
| [botgo constant.go](https://github.com/tencent-connect/botgo/blob/fe31c0dfe469001e0f783d2f07e7de7bd08b403f/constant/constant.go#L8) | 正式 API 地址为 `https://api.sgroup.qq.com` |
| [botgo client.go](https://github.com/tencent-connect/botgo/blob/fe31c0dfe469001e0f783d2f07e7de7bd08b403f/websocket/client/client.go#L59) | 使用接口返回的 `session.URL` 建立 WebSocket，不固定成文档示例主机 |

据此补充两个确切主机的 `/websocket` 接入点，不扩展为 QQ 域名通配。token/REST 继续使用当前文档的 `api.bot.qq.com`，未加入 sandbox、多分片、压缩或任意查询参数支持。地址拒绝仅给出固定类别，不保留完整地址。未读取用户实际 Gateway 返回值，因此尚不能断言该用户的地址具体是哪一种；实际连接需安装补丁后验收。

## 验收

### 0.3.2 任务失败处理核对 — 2026-10-14

重新获取 [OpenAI App Server](https://learn.chatgpt.com/docs/app-server.md) 与[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference.md)，并检查 0.162.0-alpha.17.2 的 ErrorNotification、TurnError、CodexErrorInfo 和输入 schema。该版本错误枚举的 wire 名称为 camelCase，HTTP 401 位于 `httpConnectionFailed.httpStatusCode`；通知有 `willRetry`，最终错误位于 `turn/completed` 的 `turn.error`。不把网页展示的 PascalCase 直接作为 wire 名称。

使用全新 CODEX_HOME、合成项目及只含合成账号的 loopback Responses 服务，原生初始化、新线程、轮次提交和正常完成通过；本机模拟 HTTP 401 返回原生 failed，映射为固定 authentication 类别，不展示原始正文。没有真实模型请求或真实账号访问；这些结果不能确定用户这次中断的真实原因。

按[使用说明](setup.md)在无秘密项目连接、配对，用 `/new` 读取 README，再验收一个写文件任务。分别记录 ChatGPT 和 API Key 的实际请求，自定义服务商另行核验。检查本人/非法身份、群聊、重复消息、过期配对、电脑拒绝、取消、断网恢复、重载未知状态、过期/已解决审批与多窗口占用。

不自动批准、模拟点击或移除认证来通过测试。合成和宿主结果见[验证记录](verification.md)，普通 CI 不访问真实 QQ 或付费模型。
