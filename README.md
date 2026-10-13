# Codex AnyDevice

[English](README.en.md) · [配置向导说明](docs/setup.md) · [调研报告](docs/research.md) · [开发路线](docs/roadmap.md)

计划通过手机 QQ 直接操控电脑上的 Codex，并在 VS Code 中管理项目、任务和会话交接；微信作为后续独立渠道。社区项目，非 OpenAI、腾讯或 Microsoft 官方产品。

**当前状态：0.2.2 个人 QQ 直连配置准备。** 可以检测 Codex、保存机器人信息、登记自己的 QQ 身份、选择一个项目并预览配置摘要。认证检查区分 ChatGPT 登录和 API Key；未检测到 OpenAI 认证不代表自定义服务商不可用，检测也不验证请求可用性。机器人未创建时可先完成其他准备并保存进度。已移除 OpenClaw 检测、安装提示、配置片段和专属命令；QQ 消息收发与 Codex 任务执行仍待实现，没有市场发布。

用户优先级：两种用法都需要，先打通手机发起新任务，再支持已有会话续聊、提问和审批。

## 推荐方向

采用 **QQ 官方机器人 → AnyDevice 扩展 → 本机 Codex app-server**，面向一个用户和一个项目。扩展负责腾讯接口鉴权、连接恢复、身份与项目授权、消息去重和结果回传；用户使用流程不依赖 OpenClaw。

QQ 优先验证官方 WebSocket 长连接，具体接入权限以机器人后台和真实账号为准；Webhook 需要 HTTPS 回调地址。扩展直连时电脑和 VS Code 需保持运行。微信和已有 VS Code 会话交接分别验证；原生新任务不等于接管运行中的桌面会话。完整依据与边界见[调研报告](docs/research.md)和[直连原型步骤](docs/qq-direct-poc.md)。

## 开发

开发需要 Node 22+、Python 3.8+、VS Code 1.96+。扩展没有 npm 运行时或开发依赖；用户需要本机可用的 Codex。Codex 原生程序可从已安装的 OpenAI 扩展发现，npm 入口按其自身要求使用 Node。

```text
node scripts/check.js
node --test tests/extension.test.js tests/setup.test.js tests/runtime.test.js
python -B tests/package_validation.py
python -B build.py --output dist
```

在 VS Code 中按 F5 启动 Extension Development Host，点击状态栏 **Codex AnyDevice** 或运行 **打开个人 QQ 配置向导**。向导支持中英文、深浅主题和窄窗口。密钥通过密码框输入并保存到 SecretStorage；网页和配置摘要不包含明文密钥。0.2.0 已保存的机器人、身份和项目资料继续可用。

`dist/` 是开发用离线 VSIX；首次正式发布须使用官方 `@vscode/vsce`，审计同一份包并完成隔离宿主验收，见[发布流程](docs/releases.md)。

## 仓库约定

基础设置沿用 [Codex Beacon](https://github.com/Young581/codex-beacon)：公开仓库、MIT、`main`、中英文说明、问题模板、Windows/Linux/macOS CI、只读 Actions 权限、明确打包清单和 SHA-256 复核。实际设置及尚未验证的功能分别记录在[维护方案](docs/maintenance.md)与[验证记录](docs/verification.md)。

| 目录 | 内容 |
| --- | --- |
| `extension/` | VS Code 扩展入口 |
| `docs/` | 调研、架构、原型步骤、路线与维护说明 |
| `scripts/` | 本地检查、GitHub 配置工具 |
| `packaging/` | 发布文件白名单和审计 |
| `tests/` | 合成扩展与打包检查 |

[贡献说明](CONTRIBUTING.md) · [隐私](PRIVACY.md) · [安全报告](SECURITY.md) · [变更记录](CHANGELOG.md)
