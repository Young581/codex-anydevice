# 验证记录

## 0.1.0 仓库基础 — 2026-10-13

此版本仅含研发骨架，手机消息、真实 Codex 执行、OpenClaw 部署、微信登录、已有会话交接、审批和真实 VS Code 宿主尚未验收。三平台 CI 验证源码与打包，不等于三平台产品功能支持。

- Windows 本地：清单、语言资源、JavaScript 语法与文档链接检查通过；4 项合成扩展入口检查通过。
- Python 3.8 本地：11 项打包检查中 10 项通过，1 项源文件符号链接检查因普通用户权限不允许创建链接而跳过。
- 离线开发 VSIX 构建及逐文件白名单、敏感内容、清单身份与 SHA-256 审计通过；两次合成构建字节一致。
- 本机没有独立 Node 安装，JavaScript 检查使用 VS Code 自带 Node 24.21.0；合成测试运行时关闭 Electron 的测试进程隔离。CI 使用独立 Node 24。

- 首个提交 `3e4f0ea` 的 [GitHub Actions](https://github.com/Young581/codex-anydevice/actions/runs/38368720048) 在 Windows、Ubuntu 和 macOS 全部通过源码、合成扩展、打包边界、构建与最终包审计；Windows 开发 VSIX 与校验文件已上传为 CI Artifact。
- 实际 GitHub 设置核对与 `.github/repository-settings.json` 一致，差异为空：包括可见性、默认分支、仓库开关、合并选项、标签、Actions 权限及安全扫描设置。
- 代码已推送到独立公开仓库，无真实用户数据、运行缓存、凭据或生成安装包进入 Git 跟踪。

公开记录仅使用脱敏摘要与合成数据。CI 运行成功不替代尚未完成的产品与真机验收。
