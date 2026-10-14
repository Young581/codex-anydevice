# 个人 QQ 直连配置与使用

0.4.0 已接入 QQ 官方 WebSocket 与 Codex 新线程原型，不依赖 OpenClaw。真实机器人接入、手机收发及模型任务仍需验收。

## 准备电脑与机器人

安装本地 VSIX 并重载 VS Code，打开受信任的本地项目，点击状态栏 **Codex AnyDevice** 或运行 **打开个人 QQ 配置向导**。Remote SSH、容器与虚拟工作区本版不支持。

**检查 Codex 环境** 仅运行版本和 `login status`，提供有界摘要，不发起模型请求。ChatGPT 登录和 API Key 都由 Codex 支持；未检测到 OpenAI 登录不代表自定义服务商不可用，也不等于当前编辑器会话的认证。任务使用所选 CLI 自己的认证、模型与服务商，API 使用可能计费，AnyDevice 无需再次填写模型密钥。

Codex 从 PATH、Windows npm 入口或已安装 OpenAI 扩展发现，也可手动指定绝对路径。原型仅核对 **0.162.0-alpha.17.2**，其他版本安全拒绝。npm 入口使用其需要的 Node，调用不经过 shell。QQ 连接需要近期 VS Code 的原生 fetch/WebSocket，缺少能力会提示更新。

在 [QQ 开放平台](https://q.qq.com/)创建官方机器人，按后台要求允许本人测试/使用及私聊。密钥只填本机密码框，保存在 SecretStorage，不进入网页、摘要或日志。更换 AppID 清除旧身份，0.2.x 配置继续使用。

QQ 文档列出 WebSocket，但账号权限以实际连接为准。本版支持 `api.bot.qq.com` 与腾讯官方 SDK 使用的 `api.sgroup.qq.com` 的单分片 WSS `/websocket` 接入点；其他主机、路径和附加参数保守拒绝，未实现需要 HTTPS 回调的 Webhook。

若 0.3.0 显示“QQ 返回了当前未核对的连接地址”，安装 0.4.0 并重载 VS Code 后重新连接，已保存的机器人与项目配置继续使用。若仍失败，只需反馈页面中的 `transport`、`host`、`path` 或 `options` 类别，无需发送完整连接地址、参数或密钥。插件不会自动改写地址或绕过校验。

## 连接并自动取得身份

1. 选择当前打开的一个本地项目，保存其真实目录。
2. 点击 **连接 QQ**，自动检查环境，等待 **QQ 已连接**。此时尚未授权手机任务。
3. 连接成功自动显示 `/pair 一次性代码`，5 分钟有效、最多 5 次尝试。
4. 用本人 QQ **私聊**机器人发送该命令；电脑显示真实发信人的 OpenID 和项目，确认刚才是自己发送后点击 **确认本人并授权项目**。
5. 页面显示 **本人 QQ 已配对**，机器人返回命令说明。

身份来自 `C2C_MESSAGE_CREATE` 的外层 `d.author.user_openid`，**无需 QQ 号码或手工找 ID**。群聊与引用身份无效。高级手工登记仅保存资料，每次连接仍需配对，见[身份说明](qq-identity.md)。拒绝、过期或已使用的代码需重新开始。

主动断开、重载或重启后需重新配对；短时自动重连可保留本次身份。同一机器人多窗口连接会被占用检查拒绝。修改机器人、项目、身份、Codex 路径或清除配置会撤销连接。

## 官方面板显示和电脑续聊

需要在官方 Codex 中看运行进度并继续聊时，首次点击 **启用官方 Codex 同步**，确认保存原入口，结束桌面任务后重载 VS Code。后续 `/new` 自动打开官方会话，完成后可在同一线程输入后续问题。同步目前锁定 Windows 与官方扩展 26.51007.21434；**恢复原 Codex 入口** 可撤回。卸载前先恢复并重载。高级环境检查、OpenID 登记和配置摘要无需每次操作。详见 [同步边界](official-sync.md)。

## 新任务指令

| 指令 | 行为 |
| --- | --- |
| `/new 任务内容` | 在授权项目中创建独立 Codex 新线程，一次一个任务 |
| `/status` | 返回最近任务 ID 与状态，不重放、不创建模型请求 |
| `/cancel` | 请求中断，确认前显示正在取消 |

首次请在无秘密的合成项目发送：

```text
/new 读取 README，概括项目用途，不修改任何文件，不运行命令。
```

核对接收、运行、结果及实际文件。写文件、运行命令、ChatGPT/API 两种任务另行验收。电脑和 VS Code 必须保持运行；本版不支持手机既有线程续聊、手机审批、提问回复、群聊、附件或多项目。

## 收到任务后失败或状态未确认

“已收到新任务”表示指令已接收，还不代表 Codex 完成任务。0.3.2 会在电脑页面、QQ 最终回复和 `/status` 中显示阶段与固定原因；保存的机器人/项目配置继续使用，更新重载后需要重新配对。

| 提示类别 | 下一步 |
| --- | --- |
| version / spawn / exit / connection | 检查所选 Codex CLI 能否正常启动及版本，反馈类别和任务阶段 |
| authentication / limit | 核对所选 CLI 的登录、API 授权或额度；在 CLI 中处理，无需把模型密钥填入插件 |
| provider / parameters / request | 核对所选 CLI 的模型/服务商配置与兼容性，反馈类别和任务阶段 |
| protocol / timeout / sandbox / task | 反馈类别和任务阶段；沙箱设置在官方 Codex 中处理 |

旧版的未知记录无法补回当时的失败原因。若没有最终结果，先核对本机任务和项目状态，再发新任务；插件不会自动重放或宣称修改已撤销。无需发送完整地址、原始日志、登录文件或密钥。

若 0.3.2 在“创建新线程”阶段提示“Codex 未返回预期的沙箱与用户审批策略”，先安装 0.4.0、重载、重新连接和配对，再发一个新任务。旧版误将有效 workspace-write 的空额外可写目录列表视为错误；0.4.0 已修复这一兼容问题。保存的机器人、项目与 Codex 路径继续使用。其他策略不匹配仍会停止任务，更新后的真实执行结果需复测。

## 电脑审批与沙箱

Codex 请求审批时，原生确认框显示准确 request/thread/turn/item，以及命令或可用文件变更。仅 **允许此条请求** 表示明确允许；关闭、拒绝或 2 分钟到期均不允许。已解决、跨线程、取消后的窗口不能批准新请求。

使用 `on-request` 与 `approvalsReviewer: user`；是否需要审批由 Codex 决定，正常沙箱内操作并非每次弹窗。不使用自动审核、会话级缓存批准或持久规则。完整请求太大、文件审批缺少内容、会话级 grantRoot、终端输入、权限工具、动态工具、MCP elicitation 与用户提问等未支持请求会拒绝或停止任务。

请求 workspace-write、单项目根、工具网络关闭及临时目录额外写入关闭，检查原生返回的有效策略后才提交任务。工作目录自动包含在可写范围中，额外可写目录列表可为空。轮次继承已核对的线程策略，保留原生读取规则；原生若返回更严格的只读沙箱，任务保留该限制并提示。Windows 如需项目写入，请在官方 Codex 完成其沙箱设置。插件不代改系统沙箱或登录文件。所选工作目录不是完整读取边界；越界请求可能授予该次命令更广权限，需审查完整内容。

## 结果与撤销

最新 agent 结果仅在内存保留最多 20,000 字符，**查看本次结果** 打开未保存文档。QQ 返回最多 1,400 字符摘要；源消息按保守 5 分钟期限、最多 4 次回复处理。过期/失败显示回传未确认；长任务请再发 `/status`，正文在电脑查看。

终止连接失败会撤销配对、停止拥有的进程、释放占用，将未确认任务标为 unknown。重启保留匿名去重记录与最近任务 ID/状态，不重放。取消超时或意外退出不宣称文件变化已撤销。

预览仍是资料摘要，`phoneConnection: requiresExplicitConnectionAndPairing` 与 `requiresLivePairing: true` 不代表运行时授权。清除经电脑确认后断连，移除本插件密钥、身份、项目与任务记录，保留拒绝旧事件的时间截断。导出文档、Codex 保存的新线程、QQ 消息与机器级运行时路径需自行管理。密钥删除失败会报告未完成，连接已撤销。

## English

Save official bot credentials, select one trusted local project and connect to generate a pairing code automatically. Send `/pair CODE` from your own QQ private chat and confirm on the computer. OpenID is obtained automatically; manual metadata still requires pairing. Use `/new TASK`, `/status`, `/cancel`. Each task uses a separate thread and existing CLI authentication/model/provider; API calls may incur charges. Verified version: 0.162.0-alpha.17.2.

Requested approvals stay on the computer, expire after two minutes and require exact request matching. Unsupported requests fail closed. More restrictive native read-only policies are preserved. Restarts revoke pairing and never replay tasks. QQ reply expiry is conservatively five minutes; view bounded results on the computer if delivery fails. Bot eligibility, phone use and real subscription/API execution remain unverified.

## 官方依据

2026-10-14 重新获取 [Codex App Server](https://learn.chatgpt.com/docs/app-server.md)、[QQ 鉴权](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/api-use.html)、[事件与连接](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)、[单聊事件](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/c2c_message_create.html)与[单聊发送](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html)，并以精确版本生成 schema、隔离初始化/线程返回核对，见[原型证据](qq-direct-poc.md)。
