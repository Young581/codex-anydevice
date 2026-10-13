# 首条链路的原型步骤

此清单用于下一阶段，在隔离账号/合成项目验证；本轮没有执行以下安装与登录。

1. 记录 OpenClaw、Codex CLI、QQ 插件版本和操作系统；先核对各版本发布说明与依赖要求。使用现有原生 Codex 登录，不把 auth.json 复制进仓库。
2. 按 [OpenClaw QQ 文档](https://docs.openclaw.ai/channels/qqbot)在 QQ 开放平台创建机器人。通过交互式向导提供 AppID/AppSecret，不把真实密钥写在终端命令、截图或公开报告里。
3. 使用文档列出的插件：`openclaw plugins install @tencent-connect/openclaw-qqbot`，然后 `openclaw channels add` 选择 QQ。版本在实验开始时锁定并记录，不预设本轮未验证的版本组合。
4. QQ 采用 `dmPolicy: "allowlist"`，`allowFrom` 仅登记自己的机器人 OpenID，群聊初期禁用。先验证其他发送者无法启动任务，再配置可执行项目。审批人使用独立明确列表；不照抄文档示例的开放私聊策略。
5. 按 [Codex harness 文档](https://docs.openclaw.ai/plugins/codex-harness)安装 `@openclaw/codex` 并启用原生 Codex 路由。保留正常审批策略，确认没有启用 `yolo` 或自动允许所有操作。认证由 Codex 负责。
6. 在一个仅含合成文件的项目里，从手机发送“新增一个说明文件”之类的任务。记录发送身份、消息 ID、工作目录、native thread/turn ID，以及手机返回的结果。验证实际执行后端为 Codex。
7. 测试继续当前新建会话、取消任务、Codex 提问、明确允许/拒绝、网关断连重连、重复消息与休眠恢复。QQ 的聊天权限、控制命令权限和审批权限分别核实。
8. 把结果写入 `docs/verification.md`，包括确切版本、通过/失败项目、脱敏证据和未验证项；再实现 VS Code 项目登记与任务状态桥接。

微信原型另开实验，采用 [WeChat 文档](https://docs.openclaw.ai/channels/wechat)列出的腾讯插件。扫码由账号持有人操作。须验证文档中的 2.4.8 配对/撤销问题是否已修复；扫码能聊不等于标准配对和撤销权限有效。

已有 VS Code 会话在第二阶段验证。先选择空闲会话，明确标记继续原线程还是 fork；不得让两个 stdio app-server 同时写同一线程。Windows 与 macOS/Linux 的连接方式分别验收。
