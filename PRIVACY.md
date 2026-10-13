# 隐私与数据 / Privacy and data

## 当前 0.2.2

扩展提供配置向导，不读取 Codex 会话正文、不执行任务或发送 QQ 消息，没有开发者运营的服务器或遥测。AppSecret 通过密码输入框保存在 VS Code SecretStorage，不放入网页、剪贴板、配置摘要、日志或普通设置。AppID、QQ OpenID 和选定项目的真实路径存于本插件的 globalState；未通过 setKeysForSync 登记同步，这些元数据也可能敏感。升级保留 0.2.0 的这些资料。

用户主动检查时只调用 Codex 的版本与登录状态命令；向页面提供有界的版本与状态，不提供原始进程输出。Codex CLI 读取其正常使用的登录信息；本插件不复制登录文件。网页按钮只允许固定操作和官方链接，运行时探测不使用 shell。当前版本不检测或连接 OpenClaw。

认证方式检查支持 ChatGPT 和 API Key，不读取或修改 Codex 的认证/配置文件，不向网页提供模型密钥或服务商地址，不发起模型请求。API Key 被 CLI 检测到不代表已经验证有效；自定义服务商无法仅凭 OpenAI 登录状态判断可用性。

配置摘要包含机器人 ID、明确 QQ 身份、项目路径和计划的授权，不包含 AppSecret。用户保存或复制该预览会在选择的位置留下元数据。清除操作确认后移除本插件的 QQ 密钥与配置进度，不保证删除用户导出的文档、平台消息或备份。机器级运行时路径设置不在此清除范围，需在 VS Code 设置中管理。

构建和 CI 使用源码与合成数据。`scripts/github-settings.py` 是手动仓库管理工具：通过现有 Git 凭据管理器访问 GitHub API，令牌仅在进程内使用，不进入扩展或输出。

## 后续功能的设计要求

手机指令和选择回传的结果将经过 QQ 官方接口及本机 AnyDevice，微信另行研究。这与 Beacon 仅转发通知元数据的行为不同；聊天渠道可以接触消息正文，其保留与删除规则由平台决定。正式接入前更新本说明，列明实际读取、传输、存储、保留与撤销方式。

默认仅允许明确身份与项目；凭据使用受保护的本地存储；最小化任务记录；日志默认不保留提示词、完整结果、命令参数或真实目录。删除本机记录不等于删除聊天平台或备份里的副本。独立系统账号与受限数据目录是跨用户隔离基础。

## English

Version 0.2.2 prepares direct QQ access and retains existing setup data. AppSecret stays in VS Code SecretStorage; bot ID, sender OpenID and project path are local extension metadata. They are not registered for settings sync. Explicit checks only run Codex version and login status commands and expose bounded summaries, never raw CLI output. Authentication checks distinguish ChatGPT and API keys without reading or modifying authentication/configuration files, exposing model credentials/provider addresses, or issuing model requests. Detection does not validate keys or determine custom-provider availability. The setup preview contains no plaintext secret. It does not execute Codex tasks or send QQ messages. Clearing removes extension-owned credentials and progress, not exported documents or machine-level runtime path settings. There is no telemetry server or OpenClaw connection.

Future phone commands and returned results pass through the QQ provider and local AnyDevice extension. This differs from Beacon's metadata-only notifications. The policy must be updated before those features ship, including actual storage, retention and revocation behavior. Local deletion cannot guarantee deletion of provider messages or backups.
