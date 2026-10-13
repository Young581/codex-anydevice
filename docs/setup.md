# 个人 QQ 配置向导

0.2.0 提供本地配置准备：环境与网关检测、密码框保存 QQ AppSecret、绑定一个 QQ OpenID、选择当前项目、预览无明文密钥的 OpenClaw 配置片段、复制手机绑定指令。尚未自动应用网关配置、注入凭据、启动网关或验收 QQ 消息收发。

## 打开向导

在受信任的本地项目中点击状态栏 **Codex AnyDevice**，或运行 **Codex AnyDevice: 打开个人 QQ 配置向导**。Remote SSH、容器与虚拟项目本版不进入向导。重开 VS Code 后可以继续已保存的进度。

## 1. 准备电脑

点击 **检查环境与连接**。检测实际运行 `codex --version`、`codex login status`、`openclaw --version`、`node --version` 与 `openclaw health --json`。只显示版本和状态，不显示原始输出、账号邮箱、错误正文或令牌。网关可访问不等于 QQ 渠道或原生 Codex 后端已经验收。

Codex 从 PATH 或已安装的 OpenAI Codex 扩展发现。OpenClaw 从 PATH 和 Windows npm 启动目录发现；Windows 的 `codex.cmd`、`openclaw.cmd` npm 入口转换为 Node 调用对应包入口，不经过命令解释器。Codex 的 npm 入口不可运行时会尝试已安装扩展的原生程序。发现失败时可在页面手动指定绝对路径；设置为机器级，避免项目配置与跨设备同步覆盖它。

本轮查阅的 OpenClaw 文档要求 Node **24.16+ 或 26.1+**，向导会提示不满足要求的已识别版本；未列出的主版本也不标记为已支持。独立 Node 缺失时请按[官方安装说明](https://docs.openclaw.ai/install)准备 OpenClaw；VS Code 自带 Node 可以运行本扩展，但不等于已安装供 OpenClaw 使用的独立 Node。插件不会自动下载运行时或执行网上的安装脚本。

## 2. 创建机器人并绑定自己

在 [QQ 开放平台](https://q.qq.com/)创建官方机器人，在本机向导填写 AppID/AppSecret。AppSecret 使用 VS Code 密码输入框和 SecretStorage，不进入网页、剪贴板、配置片段或日志。取消输入保留原配置；更换 AppID 会清除旧的 QQ 身份绑定，因为 OpenID 随机器人变化。

**绑定我的 QQ** 填写此机器人的用户 OpenID，不是昵称或 QQ 号码。[QQ 插件文档](https://docs.openclaw.ai/channels/qqbot)提供私聊 `/bot-me` 命令来查看自己的 OpenID；也可从开放平台提供的本人测试事件中取得。尚未获得 OpenID 时保留进度，不能生成完整配置片段；不要用通配符或开放所有私聊来绕过此步骤。`/bot-me` 在所用版本与访问策略中的实际行为仍需机器人创建后验证。

生成的片段仅允许一个明确身份，禁用群聊，并为执行审批指定同一个明确身份。实际审批行为由所用 OpenClaw/QQ 插件版本决定，需真机测试。

## 3. 选择项目

向导只允许从当前打开的本地文件夹选择一个项目，保存其真实目录。切换项目通过重新选择完成；不是自动授予当前所有项目。预览或复制前重新检查目录是否存在、是否被链接替换。

选定目录只是计划的默认工作目录，不是文件访问沙箱；远程执行时仍需核对 Codex 实际权限、沙箱与信任配置。0.2.0 不执行 Codex 任务，也不改变项目文件。

## 资料齐全之后

预览的是**配置片段**，不是可直接替换现有 `openclaw.json` 的完整配置。QQ AppSecret 使用 `QQBOT_CLIENT_SECRET` 的 SecretRef；当前保存在 SecretStorage 的密钥尚未自动注入 OpenClaw，不能因片段已生成就认为网关已获得密钥。

下一步在 OpenClaw 官方向导完成网关、原生 Codex 登录、模型与插件安装，安装文档列出的 `@tencent-connect/openclaw-qqbot` 和 `@openclaw/codex`。按官方 SecretRef 方案准备密钥，在停止网关且备份后审查合并片段；如果配置有 `plugins.allow`，需包含实际安装的 QQ 插件及 `codex`。不要以该片段覆盖已有其他配置。

连接自己的机器人之后，在 QQ 私聊中发送复制的 `/codex bind --cwd ...`，再用 `/status`、`/codex status`、`/codex binding` 核实原生 Codex 和目标项目。命令需要 owner 权限；不能将“自己的 QQ 已列入聊天白名单”当作所有控制权限均已取得。

页面显示 **配置资料齐全** 只说明信息准备完成。第一条真实任务、取消、提问与审批测试通过后才能记录手机链路可用。

## 清除

**清除本插件的配置** 在确认后移除 AppSecret、AppID、QQ 身份和项目选择，仅操作本插件的数据。已经手动导出的文档、OpenClaw 配置和消息平台记录需在各自位置管理。若 SecretStorage 删除失败，向导会报告未完成，配置进度已经禁用。

## English

Open **Codex AnyDevice: Open personal QQ setup wizard** in a trusted local folder. Check the computer, enter QQ credentials using native password input, bind your explicit bot-specific OpenID, and choose one project. Progress is saved locally; AppSecret is held by VS Code SecretStorage.

The preview is a configuration fragment with an environment-backed SecretRef, not a complete profile. This version does not apply it, inject credentials, start a gateway or send QQ messages. Gateway reachability and complete setup details do not prove phone connectivity. Finish the official OpenClaw setup and verify the native Codex route before device testing. A working directory is not a filesystem sandbox.

## 官方依据

2026-10-13 实际查阅：[OpenAI 认证](https://learn.chatgpt.com/docs/auth)、[OpenClaw 安装](https://docs.openclaw.ai/install)、[CLI](https://docs.openclaw.ai/cli)、[配置操作](https://docs.openclaw.ai/cli/config)、[QQ SecretRef 与访问策略](https://docs.openclaw.ai/channels/qqbot)、[Codex 配置](https://docs.openclaw.ai/plugins/codex-harness/configuration)、[Codex 命令](https://docs.openclaw.ai/plugins/codex-harness/commands)。
