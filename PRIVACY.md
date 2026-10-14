# 隐私与数据 / Privacy and data

## 当前 0.4.0

用户主动连接后访问腾讯官方接口并接收机器人事件，只授权代码配对与电脑确认的本人私聊。手机指令和 Codex 结果经过腾讯平台及本机插件，平台拥有其保留/审核/删除规则。没有开发者中转服务器、遥测或 OpenClaw 连接。

AppSecret 经密码框保存在 SecretStorage，不进入网页、剪贴板、摘要、普通设置或诊断。QQ Token、配对验证、native IDs、审批内容、prompt 与结果仅在内存；AppID、OpenID 和项目真实路径在本插件 globalState，未注册同步，可能敏感。电脑确认框显示真实 OpenID，网页不展示。断开或重启清除本次验证。

最新 agent 结果最多 20,000 字符留内存，新任务/清除/重启移除；主动查看打开未保存文档，保存与复制由用户管理。QQ 返回摘要，过期或失败不保证送达。

去重日志最多 512 个 SHA-256(AppID、sender、messageID)、事件时间、截断及最近随机任务 ID/状态，并保留经过白名单检查的错误类别与阶段，无原始身份、目录、prompt、结果、原始错误正文或 native IDs。诊断只使用固定类别和结构化错误码，不记录服务商地址、stderr 或原始错误消息。哈希仍可能关联，不宣称不可追踪匿名。重启活跃记录为 unknown，不重放修改。

任务启动所选 CLI app-server，Codex 按正常配置保存新线程，并向配置的模型服务商发请求，API 可能计费。AnyDevice 不读取旧会话、登录/模型配置文件或复制 API Key；原生子进程自行读取正常所需的配置/认证。普通环境检查只调用版本和登录状态，不验证实际请求。

审批内容只在电脑显示，不转发 QQ，仅支持明确单条允许/拒绝。项目可能含敏感信息，请选择适合通过 QQ 传输的内容；工作目录不是完整读取边界，原生越界请求应逐条审查。

确认清除后断连，移除本插件密钥和配置/任务记录，保留拒绝旧事件的时间截断。不能删除导出文档、腾讯消息、备份或 Codex 保存的新线程；机器级运行时路径在 VS Code 设置管理。密钥删除失败会提示，连接已撤销。

机器人占用端口仍只作跨窗口锁，入站立即关闭。启用官方同步后，另有带随机令牌认证的 loopback 本机控制通道，只有当前 Windows 用户可访问连接描述和令牌；它们位于独立 globalStorage，关闭官方后端后删除。令牌不进入命令行、QQ、网页或日志。原入口设置与启动程序路径保存在本插件元数据，以便准确恢复。原生线程 ID 和写入占用仍只在内存。构建与 CI 用合成状态；GitHub 维护工具凭据仅在管理进程内，不进入扩展或输出。

## English

Explicitly connected QQ instructions and selected agent results pass through Tencent and local AnyDevice. There is no developer relay, telemetry or OpenClaw. AppSecret stays in SecretStorage. Tokens, verified pairing, native IDs, prompts and bounded results stay in memory. Bot ID, sender OpenID and project path are local metadata without registered sync. A bounded journal stores only hashed message identity, timestamps, a cutoff, the latest random task ID/state, and allowlisted diagnostic categories/stages; hashes can be linkable. Raw error bodies, provider addresses and stderr are never recorded.

The selected Codex CLI uses its normal authentication/model/provider and may persist new threads or charge API usage. AnyDevice does not read old conversations or login/model files. Optional official sync adds an authenticated loopback control channel. Its random token and connection descriptor are in private Windows storage and removed when the official backend closes; native IDs and ownership remain in memory. The original CLI entry is saved for restoration. Requested approvals stay on the computer. Explicit result viewing opens an unsaved document. Clearing removes extension credentials and records, retaining an event cutoff, and cannot remove platform messages, exported documents, backups or Codex threads.
