# Codex AnyDevice

[English](README.en.md) · [配置与使用](docs/setup.md) · [调研](docs/research.md) · [开发路线](docs/roadmap.md)

用手机 QQ 给电脑上的 Codex 发起新任务，在 VS Code 中选择项目、确认配对和处理审批。面向个人用户，不依赖 OpenClaw。社区项目，非 OpenAI、腾讯或 Microsoft 官方产品。

**当前 0.4.0 为 QQ 官方 WebSocket 直连与 Windows 官方面板同步原型。** 已实现连接、短时配对码、电脑确认、`/new`、`/status`、`/cancel`、结果回传和电脑审批。合成测试与真实账号验收分别记录；机器人 WebSocket/私聊权限、手机实际收发、ChatGPT/API 真实任务仍需验收。没有 Marketplace 或正式 Release 发布。

## 开始使用

1. 安装本地 VSIX，重载 VS Code，打开受信任的本地项目，点击状态栏 **Codex AnyDevice**。
2. 保存 QQ 官方机器人 AppID/AppSecret，选择一个项目。需要在官方面板看进度和续聊时，先**启用官方 Codex 同步**，结束桌面任务并重载一次。已保存的 0.2.x 配置继续使用。
3. 点击 **连接 QQ**，环境自动检查，连接成功自动显示配对码。
4. 用本人 QQ 私聊机器人发送页面上的 `/pair 一次性代码`，在电脑一次确认本人身份与项目授权。插件自动取得 OpenID，无需填写 QQ 号码。
5. 发送 `/new 读取 README，概括项目用途，不修改文件`。用 `/status` 查询状态、`/cancel` 取消；需要审批时在电脑逐条确认。

电脑和 VS Code 必须保持运行。首次验收用不含秘密的合成项目。重启或主动断开后需重新配对，不自动重放任务。配置资料齐全不代表已连接，手工登记 OpenID 也不自动授权。

官方同步仅核对 Windows、VS Code 1.141.0、`openai.chatgpt` 26.51007.21434。运行时自动打开新线程，完成后可在电脑继续聊；恢复原入口和具体边界见 [官方同步](docs/official-sync.md)。

## 兼容范围

采用 **QQ 官方机器人 → AnyDevice → 本机 Codex app-server**，无公网回调，仅支持单机器人、单发信人、单项目的私聊文字任务。账号权限以腾讯后台及实际连接结果为准；Webhook、多分片、群聊、微信与手机已有会话续聊未实现；启用同步后可在官方面板继续手机新线程。

当前核对的 Codex 为 **0.162.0-alpha.17.2**，其他版本会被拒绝启动。任务继承所选 CLI 的 ChatGPT/API Key、自定义服务商、模型与常规配置；插件不读取或改写登录/模型配置文件。API 任务可能计费。使用原生用户请求审批，不使用自动审批。若 Windows 原生运行时返回只读沙箱，任务保留限制并提示；项目写入需先在官方 Codex 完成沙箱设置。选定目录不是完整读取边界，越界请求应逐条审查。

结果仅在内存中保留最新一次的最多 20,000 字符，QQ 回传摘要；按保守 5 分钟窗口及单条源消息最多 4 次回复处理。长任务可能无法主动回传，请发 `/status` 或在电脑查看结果。完整边界见[架构](docs/architecture.md)和[隐私](PRIVACY.md)。

## 开发与维护

需要 Node 22+、Python 3.8+；QQ 直连需要具有原生 fetch/WebSocket 的近期 VS Code 扩展宿主，本轮宿主为 1.141.0。没有 npm 依赖。

```text
node scripts/check.js
node --test tests/extension.test.js tests/setup.test.js tests/runtime.test.js tests/direct.test.js
python -B tests/package_validation.py
python -B build.py --output dist
```

治理与发布沿用 [Codex Beacon](https://github.com/Young581/codex-beacon)：公开 MIT 仓库、`main`、双语说明、问题模板、Windows/Linux/macOS CI、只读 Actions、明确打包清单和 SHA-256 复核。本地离线包与官方 vsce 包分别审计，见[发布说明](docs/releases.md)、[维护方案](docs/maintenance.md)与[验证记录](docs/verification.md)。

[贡献](CONTRIBUTING.md) · [安全报告](SECURITY.md) · [变更记录](CHANGELOG.md)
