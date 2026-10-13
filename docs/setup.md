# 个人 QQ 配置向导

0.2.3 面向个人 QQ 直连：检测本机 Codex、密码框保存 QQ AppSecret、查看身份获取说明、登记已有 QQ OpenID、选择当前项目并预览配置摘要。用户使用流程不需要 OpenClaw。QQ 连接、自动配对、消息收发和任务执行尚未实现；配置资料齐全只代表准备完成。

## 打开向导

在受信任的本地项目中点击状态栏 **Codex AnyDevice**，或运行 **Codex AnyDevice: 打开个人 QQ 配置向导**。Remote SSH、容器与虚拟项目本版不进入向导。重开 VS Code 后可以继续已保存的进度。

## 1. 准备电脑

点击 **检查 Codex 环境**。只运行 `codex --version` 和 `codex login status`，显示版本与认证方式，不显示原始输出、账号邮箱、错误正文或令牌。这里检测的是所发现的 Codex CLI 状态，不等于当前编辑器中 Codex 会话的认证状态。

**ChatGPT 登录和 API Key 都可用于本地 Codex。** 向导分别显示“已检测到 ChatGPT 登录”和“已检测到 API Key”。“未检测到 OpenAI 认证”仅表示 CLI 没有报告 OpenAI 登录；自定义服务商可以使用自己的环境变量或其他认证配置，需要单独核验，不能据此判为不可用。未知输出或探测失败显示“状态未确认”，不推断已登录。

检测不会调用模型或验证密钥有效性，不消耗模型 API 额度，也不检查自定义服务商配置。本插件不读取、复制或修改你的 Codex 登录文件、配置文件或 API Key；无需在 AnyDevice 向导再次填写模型密钥。即使认证未确认，也可以保存 QQ 与项目资料。后续任务执行需另行验收所选 CLI 的实际认证、模型与服务商配置，不能假定它与编辑器当前会话一致。

Codex 从 PATH、Windows npm 启动目录或已安装的 OpenAI Codex 扩展发现。Windows 的 `codex.cmd` 转换为 Node 调用对应包入口，不经过命令解释器。npm 入口不可运行时会尝试已安装扩展的原生程序。发现失败时可在页面手动指定 Codex 的绝对路径；设置为机器级，避免项目配置与跨设备同步覆盖它。

插件运行于 VS Code 自带的扩展宿主；使用 Codex 原生程序时不要求额外安装 OpenClaw 或其 Node 环境。若选择 npm 安装的 Codex，则按 Codex 自身要求准备 Node。页面提供 [Codex 官方使用说明](https://learn.chatgpt.com/docs/cli)。

## 2. 创建机器人并绑定自己

在 [QQ 开放平台](https://q.qq.com/)创建官方机器人，在本机向导填写 AppID/AppSecret。AppSecret 使用 VS Code 密码输入框和 SecretStorage，不进入网页、剪贴板、配置摘要或日志。取消输入保留原配置；更换 AppID 会清除旧的 QQ 身份绑定，因为 OpenID 随机器人变化。尚未创建机器人时可先选择项目并保存进度。

点击 **QQ 身份怎么获取** 查看包内[获取说明](qq-identity.md)，无需已有机器人或身份。登记身份是为了将任务和审批限定为本人；AppID/AppSecret 用于连接机器人，不能代替对发信人的授权。

OpenID 来自本人给此机器人的 `C2C_MESSAGE_CREATE` 单聊事件 `author.user_openid`（WebSocket 封套中为 `d.author.user_openid`），不是昵称、QQ 号码或群聊身份，不能用 QQ 号码推算。已经有事件接收程序时，可从这条新私聊的外层发信人读取；先保存机器人信息，再展开 **高级：已取得 OpenID** → **登记已有 OpenID**。当前仅保存登记资料，页面显示“已登记，待验证”，不宣称已完成配对。

没有事件接收程序或尚未创建机器人时，可以先跳过身份步骤并保存其他进度，无需另建服务或填写猜测值。后续直连版本计划采用电脑开启短时配对、本人 QQ 发送一次性代码、插件取得身份、电脑明确确认的流程；当前尚无配对码、配对命令或自动获取按钮。身份尚未取得时不能生成包含允许发信人的摘要，任务和审批授权不会因此放宽。

配置摘要记录计划允许的一个明确发信人、同一审批身份和禁用群聊策略；它不是已生效的访问控制。实际身份拒绝和审批需在直连实现后验收。

## 3. 选择项目

向导只允许从当前打开的本地文件夹选择一个项目，保存其真实目录。切换项目通过重新选择完成；不是自动授予当前所有项目。预览或复制前重新检查目录是否存在、是否被链接替换。

选定目录只是计划的默认工作目录，不是文件访问沙箱；远程执行时仍需核对 Codex 实际权限、沙箱与信任配置。0.2.3 不执行 Codex 任务，也不改变项目文件。

## 资料齐全之后

预览的是**已保存资料的摘要**，包含机器人 ID、明确身份、项目和计划的授权策略，不含 AppSecret。`phoneConnection: "pendingDevelopment"` 表示连接功能尚待开发；摘要不是要交给第三方网关导入的配置文件。

下一阶段按 [QQ 直连原型](qq-direct-poc.md)接入腾讯接口和本机 Codex。官方文档列出 WebSocket 长连接，实际权限以机器人后台为准；Webhook 则需要 HTTPS 回调地址。当前没有部署公网服务，不能提前保证每个新账号都无需服务器。

直连目标是自己的私聊发起新任务、查看进度/结果和取消任务，保留 Codex 的明确审批。扩展直接运行时电脑和 VS Code 需要保持运行。0.2.0 的 `/codex bind`、`/bot-me` 来自旧 OpenClaw 路线，不是本插件已实现的直连命令。

页面显示 **配置资料齐全** 只说明信息准备完成。第一条真实任务、取消、提问与审批测试通过后才能记录手机链路可用。

## 清除

**清除本插件的配置** 在确认后移除 AppSecret、AppID、QQ 身份和项目选择，仅操作本插件的数据。已经手动导出的文档和消息平台记录需在各自位置管理。若 SecretStorage 删除失败，向导会报告未完成，配置进度已经禁用。升级保留 0.2.0 的资料；旧版手动导出的网关文档与已保存机器设置由用户自行管理。

## English

Open **Codex AnyDevice: Open personal QQ setup wizard** in a trusted local folder. Check the computer, enter QQ credentials using native password input, read **How to get my QQ identity**, and choose one project. If you already have your bot-specific OpenID from the outer sender of your own `C2C_MESSAGE_CREATE` event, save bot credentials first and use the advanced manual entry. OpenID is not your QQ account number. Bot and project details can be saved without it; automatic pairing is not implemented yet. Recorded identity metadata is pending verification. See the [identity guide](qq-identity.md). Progress is saved locally; AppSecret is held by VS Code SecretStorage.

Version 0.2.3 prepares direct QQ access without an OpenClaw dependency. It checks Codex and retains 0.2.0 setup data. CLI authentication checks distinguish ChatGPT sign-in and API keys. Undetected OpenAI authentication does not rule out a custom provider; unknown or failed checks do not prove sign-in. Checks do not validate requests, spend model API credits or describe the current editor session. AnyDevice does not read, copy or modify Codex authentication/configuration files or API keys. Setup details can be saved regardless of authentication detection. Actual execution with the selected CLI and provider needs separate verification.

The preview summarizes saved details and planned authorization; direct QQ messaging and task execution are still pending development. Actual QQ WebSocket eligibility must be checked for the bot, while Webhook access requires an HTTPS callback. Complete setup details do not prove phone connectivity. Keep VS Code and the computer running for the planned direct mode. A working directory is not a filesystem sandbox.

## 官方依据

2026-10-13 实际查阅：[QQ 启动接入](https://bot.q.qq.com/wiki/develop/api-v2/)、[QQ 事件与连接维护](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)、[OpenAI 认证](https://learn.chatgpt.com/docs/auth)、[Codex CLI](https://learn.chatgpt.com/docs/cli)、[Codex App Server](https://learn.chatgpt.com/docs/app-server)。

2026-10-14 重新获取 [OpenAI 认证](https://learn.chatgpt.com/docs/auth)与[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)，核对本地 API Key 支持、CLI 认证状态命令及 `model_providers.<id>.env_key` / `requires_openai_auth`；据此修正 0.2.2 的状态文案，未测试真实密钥或发起模型请求。

同日重新获取腾讯官方[单聊消息事件](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/c2c_message_create.html)和[事件订阅说明](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)，按 `C2C_MESSAGE_CREATE` / `author.user_openid` 增加 0.2.3 获取说明；未接收真实事件。
