# Codex AnyDevice 开发约定

- 先看 `README.md`、`docs/roadmap.md`、`docs/setup.md` 与 `docs/architecture.md`。当前 0.4.0 为 QQ 官方 WebSocket 新任务与 Windows 官方面板同步原型，已实现电脑配对、自动取得 OpenID、`/new`/`/status`/`/cancel` 与电脑请求审批；手工登记不自动授权。核对 Codex 0.162.0-alpha.17.2，使用 on-request/user，保留原生只读限制，不加入 OpenClaw。已通过隔离官方宿主的实时进度、原线程桌面续聊、取消后后端存活与错误令牌拒绝；官方扩展锁定 26.51007.21434，共享原生 stdio，审批仅路由到准确前端。连接自动生成配对码，身份与项目授权合并为一次电脑确认。下一目标是实际机器人/手机与 ChatGPT/API 新任务、写入和取消验收。
- 沿用 Codex Beacon 的治理与发布约定，声明式设置位于 `.github/repository-settings.json`，维护与发布流程位于 `docs/maintenance.md`、`docs/releases.md`。
- 核对当前官方 Codex/腾讯渠道文档再修改集成；记录确切版本与证据。OpenClaw 只保留为历史调研，不进入默认用户流程。区分日志观察、分支续聊、原线程续聊与运行中接管。
- 不读取或提交真实会话、登录文件、私密身份、服务器地址或运行缓存。测试使用隔离合成项目与账号。
- 保留明确发信人/审批者身份、项目授权、准确请求匹配、去重和单线程写入约束；不得通过关闭认证、自动批准或模拟点击审批来通过测试。
- 新包内文件必须加入经过审查的 `packaging/package_policy.py` 与 `.vscodeignore`，不能把整个源码目录打进 VSIX。
- 按改动运行必要检查：`node scripts/check.js`、`node --test tests/extension.test.js tests/setup.test.js tests/runtime.test.js tests/direct.test.js`、`python -B tests/package_validation.py`。涉及构建时执行 `python -B build.py --output dist` 与最终包审计。
- 验证记录明确实际通过、跳过与未验收项。CI 成功不是手机真机、真实 VS Code 宿主或市场公开发布的证据。
- 本项目使用 `codexAnyDevice.*` 和独立数据存储，不改 Beacon 的设置、Hook、证书或缓存。
