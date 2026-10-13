# Codex AnyDevice

[English](README.en.md) · [调研报告](docs/research.md) · [开发路线](docs/roadmap.md) · [维护方案](docs/maintenance.md)

计划通过手机上的 QQ、微信和 OpenClaw 操控电脑上的 Codex，并在 VS Code 中管理项目、任务和会话交接。社区项目，非 OpenAI、腾讯或 Microsoft 官方产品。

**当前状态：0.1.0 研发骨架。** 已提供调研、架构、开发计划、扩展入口、三平台 CI 和 VSIX 构建审计；尚未实现手机收发消息、Codex 执行、会话接管或远程审批。没有市场发布。

用户优先级：两种用法都需要，先打通手机发起新任务，再支持已有会话续聊、提问和审批。

## 推荐方向

先验证 **QQ 官方机器人 → OpenClaw → 原生 Codex app-server**。OpenClaw 已提供 QQ、微信渠道和 Codex 控制能力，新扩展主要负责 VS Code 项目选择、允许访问的项目范围、状态同步及会话交接。

微信作为第二条渠道：文档已列出腾讯微信团队维护的插件，但当前文档中的 2.4.8 版本有配对与撤销授权限制，需要独立验证。已有 VS Code 会话的运行中接管也需要单独实验，不能用“能读取日志”代替“能操控”。完整来源与边界见[调研报告](docs/research.md)。

## 开发

需要 Node 22+、Python 3.8+、VS Code 1.96+。当前骨架没有 npm 运行时或开发依赖。

```text
node scripts/check.js
node --test tests/extension.test.js
python -B tests/package_validation.py
python -B build.py --output dist
```

在 VS Code 中按 F5 启动 Extension Development Host，运行 **Codex AnyDevice: 打开调研与开发方案** 或 **查看开发状态**。运行入口只展示文档与开发状态。

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
