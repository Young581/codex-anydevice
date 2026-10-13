# 隐私与数据 / Privacy and data

## 当前 0.1.0

扩展只打开自带调研文档和显示开发状态，不读取 Codex 会话、不执行任务、不接入 QQ/微信/OpenClaw、不保存运行时凭据，也没有开发者运营的服务器或遥测。构建和 CI 使用源码与合成数据。`scripts/github-settings.py` 是手动运行的仓库管理工具：通过现有 Git 凭据管理器访问 GitHub API，令牌仅在该进程内使用，不进入扩展或输出。

## 后续功能的设计要求

手机指令和选择回传的结果将经过 QQ/微信及用户自己的网关。这与 Beacon 仅转发通知元数据的行为不同；聊天渠道可以接触消息正文，其保留与删除规则由平台决定。正式接入前更新本说明，列明实际读取、传输、存储、保留与撤销方式。

默认仅允许明确身份与项目；凭据使用受保护的本地存储；最小化任务记录；日志默认不保留提示词、完整结果、命令参数或真实目录。删除网关记录不等于删除聊天平台或备份里的副本。独立系统账号与受限数据目录是跨用户隔离基础。

## English

Version 0.1.0 only opens bundled research and displays scaffold status. It does not read Codex sessions, execute tasks, connect messaging channels, store runtime credentials, or upload telemetry. The manually invoked GitHub settings tool uses the existing Git credential manager session in memory; credentials are not part of the extension or its output.

Future phone commands and returned results pass through the selected messaging provider and the user's gateway. This differs from Beacon's metadata-only notifications. The policy must be updated before those features ship, including actual storage, retention and revocation behavior. Local deletion cannot guarantee deletion of provider messages or backups.
