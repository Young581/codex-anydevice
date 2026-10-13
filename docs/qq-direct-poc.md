# 个人 QQ 直连原型

目标：手机 QQ → QQ 官方机器人 → AnyDevice 本地扩展 → Codex app-server，先完成一个明确身份和一个项目的新任务。以下为待实现、待验收步骤；0.2.2 仅完成配置准备。

## 连接准备

1. 在 QQ 开放平台创建机器人，记录开放平台允许的事件、接入方式、消息配额和测试身份。QQ 文档列出 WebSocket/Webhook，但不能以文档存在推断新账号已有对应权限。
2. 优先验证官方 WebSocket 长连接：请求 Access Token 和 WSS 接入点，完成 Hello、Identify、Heartbeat/ACK、Resume 与令牌刷新。对断连、无 ACK、失效 Session 和网络错误使用有界重试，保留准确事件序号。
3. 若账号只开放 Webhook，先记录实际准入和 HTTPS 回调要求，再评估个人使用成本。当前路线不依赖 OpenClaw，也未部署公网中转服务。
4. AppSecret 使用现有 VS Code SecretStorage，在连接时读取；短期 Access Token 只留在运行内存。不把凭据放入网页、剪贴板、配置摘要或诊断输出。

## 身份与项目

直连配对计划采用本机主动开启的短时配对窗口、一次性代码、尝试次数限制和电脑确认。未授权时只处理配对事件，不能启动任务。最终允许身份使用 QQ 官方单聊事件中的机器人专属用户 OpenID；更换 AppID 会清除旧身份。配对实现之前，向导允许保存人工登记的明确 OpenID，但不会连接或执行。

默认只处理一个已授权发信人的私聊，禁用群聊。项目从本机向导选择并在执行前重新检查真实目录；手机使用登记的项目别名，不接受任意路径。选定工作目录不是 Codex 文件沙箱。

## Codex 新任务

使用自己的本机 stdio app-server 连接。锁定 Codex 版本，并用该版本的协议模式核对 `initialize`、`initialized`、`thread/start`、`turn/start`、事件回传和 `turn/interrupt`。首个任务创建独立新线程；不与其他 app-server 并发写同一线程。

认证兼容 ChatGPT 登录和 API Key；自定义服务商依赖所选 CLI 自己的认证、模型与配置。AnyDevice 不复制模型密钥到 QQ 或重新保存 Codex 登录文件。`login status` 只作为状态提示，不能单独决定服务商可用性；在专门的新任务验收中记录实际认证方式、模型、服务商与计费边界，普通 CI 不发起付费请求。

首批指令只覆盖新任务、状态和取消；状态回传区分已接收、运行中、等待提问/审批、完成、失败、取消和未确认。消息去重同时检查 QQ 事件/消息 ID 和本地操作 ID，重启后的不确定执行先查询，不重放文件修改。

审批使用原生 request ID、thread/turn、指定审批人和到期时间，明确允许/拒绝，超时不能批准。运行时诊断不保留完整提示词、结果正文、密钥或真实身份。结果发送遵守官方回复时限、频率和长度约束，失败应向桌面报告。

## 验收

- 合成账号/事件：非法身份、群聊、重复消息、跨项目、过期配对和过期审批被拒绝。
- 合成 Codex 传输：初始化、流式结果、失败、取消、断连、重启与单线程写入。
- 真实隔离宿主：配置继续保存，关闭窗口/重载明确停止接收，正在执行的任务记录取消或未知状态。
- 用户创建机器人后真机：自己的 QQ 私聊发起一个合成项目任务，核对实际文件变化、原生 thread/turn ID、进度和结果回传。

## 官方依据

2026-10-13 已读取：[QQ 启动接入](https://bot.q.qq.com/wiki/develop/api-v2/)、[事件与连接维护](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)、[OpenAI Codex App Server](https://learn.chatgpt.com/docs/app-server)。官方文档能力与本项目验收结果分别记录。
