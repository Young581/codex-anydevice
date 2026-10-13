# 隐私与数据 / Privacy and data

## 当前 0.2.0

扩展提供配置向导，不读取 Codex 会话正文、不执行任务或发送 QQ 消息，没有开发者运营的服务器或遥测。AppSecret 通过密码输入框保存在 VS Code SecretStorage，不放入网页、剪贴板、配置片段、日志或普通设置。AppID、QQ OpenID 和选定项目的真实路径存于本插件的 globalState；未通过 setKeysForSync 登记同步，这些元数据也可能敏感。

用户主动检查时调用本机运行时的版本、Codex 登录状态和 OpenClaw health 命令；只向页面提供有界的版本与状态，不提供原始进程输出。外部 CLI 读取其正常使用的登录与网关信息；本插件不复制它们的登录文件。网关检测可能按 OpenClaw 配置连接其现有服务。网页按钮只允许固定操作和官方链接，运行时探测不使用 shell。

配置预览包含明确 QQ 身份和项目路径以及环境密钥引用，不包含 AppSecret。用户保存或复制该预览会在选择的位置留下元数据。清除操作确认后移除本插件的 QQ 密钥与配置进度，不保证删除用户导出的文档、网关状态、平台消息或备份。机器级运行时路径设置不在此清除范围，需在 VS Code 设置中管理。

构建和 CI 使用源码与合成数据。`scripts/github-settings.py` 是手动仓库管理工具：通过现有 Git 凭据管理器访问 GitHub API，令牌仅在进程内使用，不进入扩展或输出。

## 后续功能的设计要求

手机指令和选择回传的结果将经过 QQ/微信及用户自己的网关。这与 Beacon 仅转发通知元数据的行为不同；聊天渠道可以接触消息正文，其保留与删除规则由平台决定。正式接入前更新本说明，列明实际读取、传输、存储、保留与撤销方式。

默认仅允许明确身份与项目；凭据使用受保护的本地存储；最小化任务记录；日志默认不保留提示词、完整结果、命令参数或真实目录。删除网关记录不等于删除聊天平台或备份里的副本。独立系统账号与受限数据目录是跨用户隔离基础。

## English

Version 0.2.0 provides a setup wizard. AppSecret stays in VS Code SecretStorage; bot ID, sender OpenID and project path are local extension metadata. They are not registered for settings sync. Explicit tool checks expose bounded version/status summaries, never raw CLI output. The configuration preview uses a SecretRef and contains no plaintext secret. It does not execute Codex tasks or send QQ messages. Clearing removes extension-owned credentials and progress, not exported documents, external gateway state or machine-level runtime path settings. There is no telemetry server.

Future phone commands and returned results pass through the selected messaging provider and the user's gateway. This differs from Beacon's metadata-only notifications. The policy must be updated before those features ship, including actual storage, retention and revocation behavior. Local deletion cannot guarantee deletion of provider messages or backups.
