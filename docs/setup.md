# 个人 QQ 配置向导

0.2.1 面向个人 QQ 直连：检测本机 Codex、密码框保存 QQ AppSecret、登记自己的 QQ OpenID、选择当前项目并预览配置摘要。用户使用流程不需要 OpenClaw。QQ 连接、消息收发和任务执行尚未实现；配置资料齐全只代表准备完成。

## 打开向导

在受信任的本地项目中点击状态栏 **Codex AnyDevice**，或运行 **Codex AnyDevice: 打开个人 QQ 配置向导**。Remote SSH、容器与虚拟项目本版不进入向导。重开 VS Code 后可以继续已保存的进度。

## 1. 准备电脑

点击 **检查 Codex 环境**。只运行 `codex --version` 和 `codex login status`，显示版本与状态，不显示原始输出、账号邮箱、错误正文或令牌。这里检测的是所发现的 Codex CLI 状态，不等于当前编辑器中 Codex 会话的登录状态。

Codex 从 PATH、Windows npm 启动目录或已安装的 OpenAI Codex 扩展发现。Windows 的 `codex.cmd` 转换为 Node 调用对应包入口，不经过命令解释器。npm 入口不可运行时会尝试已安装扩展的原生程序。发现失败时可在页面手动指定 Codex 的绝对路径；设置为机器级，避免项目配置与跨设备同步覆盖它。

插件运行于 VS Code 自带的扩展宿主；使用 Codex 原生程序时不要求额外安装 OpenClaw 或其 Node 环境。若选择 npm 安装的 Codex，则按 Codex 自身要求准备 Node。页面提供 [Codex 官方使用说明](https://learn.chatgpt.com/docs/cli)。

## 2. 创建机器人并绑定自己

在 [QQ 开放平台](https://q.qq.com/)创建官方机器人，在本机向导填写 AppID/AppSecret。AppSecret 使用 VS Code 密码输入框和 SecretStorage，不进入网页、剪贴板、配置摘要或日志。取消输入保留原配置；更换 AppID 会清除旧的 QQ 身份绑定，因为 OpenID 随机器人变化。尚未创建机器人时可先选择项目并保存进度。

**绑定我的 QQ** 目前登记此机器人的本人用户 OpenID，来源为 QQ 官方单聊事件，不是昵称或 QQ 号码。尚未取得时保留其他进度，不填写通配符。后续直连版本计划通过短时配对码与电脑确认取得明确身份；当前尚未提供配对连接。

配置摘要记录计划允许的一个明确发信人、同一审批身份和禁用群聊策略；它不是已生效的访问控制。实际身份拒绝和审批需在直连实现后验收。

## 3. 选择项目

向导只允许从当前打开的本地文件夹选择一个项目，保存其真实目录。切换项目通过重新选择完成；不是自动授予当前所有项目。预览或复制前重新检查目录是否存在、是否被链接替换。

选定目录只是计划的默认工作目录，不是文件访问沙箱；远程执行时仍需核对 Codex 实际权限、沙箱与信任配置。0.2.1 不执行 Codex 任务，也不改变项目文件。

## 资料齐全之后

预览的是**已保存资料的摘要**，包含机器人 ID、明确身份、项目和计划的授权策略，不含 AppSecret。`phoneConnection: "pendingDevelopment"` 表示连接功能尚待开发；摘要不是要交给第三方网关导入的配置文件。

下一阶段按 [QQ 直连原型](qq-direct-poc.md)接入腾讯接口和本机 Codex。官方文档列出 WebSocket 长连接，实际权限以机器人后台为准；Webhook 则需要 HTTPS 回调地址。当前没有部署公网服务，不能提前保证每个新账号都无需服务器。

直连目标是自己的私聊发起新任务、查看进度/结果和取消任务，保留 Codex 的明确审批。扩展直接运行时电脑和 VS Code 需要保持运行。0.2.0 的 `/codex bind`、`/bot-me` 来自旧 OpenClaw 路线，不是本插件已实现的直连命令。

页面显示 **配置资料齐全** 只说明信息准备完成。第一条真实任务、取消、提问与审批测试通过后才能记录手机链路可用。

## 清除

**清除本插件的配置** 在确认后移除 AppSecret、AppID、QQ 身份和项目选择，仅操作本插件的数据。已经手动导出的文档和消息平台记录需在各自位置管理。若 SecretStorage 删除失败，向导会报告未完成，配置进度已经禁用。升级保留 0.2.0 的资料；旧版手动导出的网关文档与已保存机器设置由用户自行管理。

## English

Open **Codex AnyDevice: Open personal QQ setup wizard** in a trusted local folder. Check the computer, enter QQ credentials using native password input, bind your explicit bot-specific OpenID, and choose one project. Progress is saved locally; AppSecret is held by VS Code SecretStorage.

Version 0.2.1 prepares direct QQ access without an OpenClaw dependency. It checks Codex and retains 0.2.0 setup data. The preview summarizes saved details and planned authorization; direct QQ messaging and task execution are still pending development. Actual QQ WebSocket eligibility must be checked for the bot, while Webhook access requires an HTTPS callback. Complete setup details do not prove phone connectivity. Keep VS Code and the computer running for the planned direct mode. A working directory is not a filesystem sandbox.

## 官方依据

2026-10-13 实际查阅：[QQ 启动接入](https://bot.q.qq.com/wiki/develop/api-v2/)、[QQ 事件与连接维护](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)、[OpenAI 认证](https://learn.chatgpt.com/docs/auth)、[Codex CLI](https://learn.chatgpt.com/docs/cli)、[Codex App Server](https://learn.chatgpt.com/docs/app-server)。
