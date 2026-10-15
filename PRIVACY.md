# 隐私与数据 / Privacy and data

## 当前 0.6.0

用户主动连接后访问腾讯官方接口并接收机器人事件，只授权代码配对与电脑确认的本人私聊。手机指令和 Codex 结果经过腾讯平台及本机插件，平台拥有其保留/审核/删除规则。没有开发者中转服务器、遥测或 OpenClaw 连接。

AppSecret 经密码框保存在 SecretStorage，不进入网页、剪贴板、摘要、普通设置或诊断。QQ Token、一次性代码、实时授权、审批内容、prompt 与结果仅在内存；AppID、OpenID、显式身份确认记录、最多 20 个项目的真实路径和授权、各项目续聊线程 ID 在本插件 globalState，未注册同步，可能敏感。电脑确认框显示真实 OpenID，网页不展示。断开或重启保留已确认配对；取消记住配对会移除所有目录的授权和线程目标，清除配置还会移除身份资料。

最新 agent 结果最多 20,000 字符留内存，新任务/清除/重启移除；主动查看打开未保存文档，保存与复制由用户管理。QQ 返回摘要，过期或失败不保证送达。

去重日志最多 512 个 SHA-256(AppID、sender、messageID)、事件时间、截断及最近随机任务 ID/状态，并保留经过白名单检查的错误类别与阶段，无原始身份、目录、prompt、结果、原始错误正文或 native IDs。诊断只使用固定类别和结构化错误码，不记录服务商地址、stderr 或原始错误消息。哈希仍可能关联，不宣称不可追踪匿名。重启活跃记录为 unknown，不重放修改。

任务使用所选 CLI app-server，Codex 按正常配置保存线程，并向配置的模型服务商发请求，API 可能计费。续聊通过共享原生接口分页取得当前项目会话的有界标题/状态和 ID，QQ `/sessions` 会回传这些标题；`/projects` 回传已授权项目别名，不传完整目录。选择后原生 Codex 在原线程使用历史上下文。

主动发送 `/history [编号|next]` 时，AnyDevice 经官方接口读取指定项目对话，只将用户文字和 Codex 回复分页回传 QQ（每页最多 1400 字符）；不回传工具结果、推理或附件。电脑主动查看则打开未保存文档。正文不存入插件日志或 globalState，翻页游标只保留内存；复制、保存与腾讯平台记录由用户/平台管理。AnyDevice 不直接读取本地历史文件，也不读取登录/模型配置文件或复制 API Key。原生子进程自行读取正常所需的配置/认证。普通环境检查只调用版本和登录状态，不验证实际请求。

可选 QQ 指令按钮经腾讯 Markdown/keyboard 接口发送，按钮包含固定命令和仅允许当前发信人使用的 OpenID 权限字段，不含密钥、项目路径、线程 ID 或历史正文；默认关闭。客户端未发送的输入文字不传给插件，不监视键盘或自动提交命令。

审批内容只在电脑显示，不转发 QQ，仅支持明确单条允许/拒绝。项目可能含敏感信息，请选择适合通过 QQ 传输的内容；工作目录不是完整读取边界，原生越界请求应逐条审查。

确认清除后断连，移除本插件密钥和配置/任务记录，保留拒绝旧事件的时间截断。不能删除导出文档、腾讯消息、备份或 Codex 保存的新线程；机器级运行时路径在 VS Code 设置管理。密钥删除失败会提示，连接已撤销。

机器人占用端口仍只作跨窗口锁，入站立即关闭。启用官方同步后，另有带随机令牌认证的 loopback 本机控制通道，只有当前 Windows 用户可访问连接描述和令牌；它们位于独立 globalStorage，关闭官方后端后删除。令牌不进入命令行、QQ、网页或日志。原入口设置与启动程序路径保存在本插件元数据，以便准确恢复。除所选续聊线程 ID 外，原生请求/轮次 ID、标题列表和写入占用仅在内存。构建与 CI 用合成状态；GitHub 维护工具凭据仅在管理进程内，不进入扩展或输出。

## English

Explicitly connected QQ instructions and selected agent results pass through Tencent and local AnyDevice. There is no developer relay, telemetry or OpenClaw. AppSecret stays in SecretStorage. Tokens, live authorization, prompts and bounded results stay in memory. Bot ID, confirmed sender OpenID, explicit identity confirmation, project path/grant and selected continuation thread ID are local metadata without registered sync. Pairing survives restart; forgetting pairing removes the confirmation, project grant and target. A bounded journal stores only hashed message identity, timestamps, a cutoff, the latest random task ID/state, and allowlisted diagnostic categories/stages; hashes can be linkable. Raw error bodies, provider addresses and stderr are never recorded.

The selected Codex CLI uses normal authentication/model/provider and may persist threads or charge API usage. `/sessions` pages through current-project titles. Explicit `/history [NUMBER|next]` reads dialogue through the official backend and sends user/assistant text to QQ in pages of up to 1400 characters, excluding tools, reasoning and attachments. Desktop viewing opens unsaved documents. History text is not persisted by AnyDevice; cursors stay in memory. The extension does not read local history/login/model files. Up to 20 folder paths, grants and individual continuation targets are local metadata. Optional sender-bound QQ command buttons contain fixed commands and sender OpenID, with no automatic sending or access to unsent typing. Official sync adds an authenticated loopback channel; native IDs and ownership stay in memory. Clearing cannot remove Tencent messages, exported documents, backups or Codex threads.
