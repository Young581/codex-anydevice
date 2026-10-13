# Codex AnyDevice 开发约定

- 先看 `README.md`、`docs/roadmap.md`、`docs/setup.md` 与 `docs/architecture.md`。当前 0.2.2 为个人 QQ 直连配置准备，认证提示兼容 ChatGPT 和 API Key，并明确自定义服务商的检测限制；用户已决定不加入 OpenClaw。下一目标是完成 QQ 官方接口直连、电脑确认配对与 Codex 新任务验收。
- 沿用 Codex Beacon 的治理与发布约定，声明式设置位于 `.github/repository-settings.json`，维护与发布流程位于 `docs/maintenance.md`、`docs/releases.md`。
- 核对当前官方 Codex/腾讯渠道文档再修改集成；记录确切版本与证据。OpenClaw 只保留为历史调研，不进入默认用户流程。区分日志观察、分支续聊、原线程续聊与运行中接管。
- 不读取或提交真实会话、登录文件、私密身份、服务器地址或运行缓存。测试使用隔离合成项目与账号。
- 保留明确发信人/审批者身份、项目授权、准确请求匹配、去重和单线程写入约束；不得通过关闭认证、自动批准或模拟点击审批来通过测试。
- 新包内文件必须加入经过审查的 `packaging/package_policy.py` 与 `.vscodeignore`，不能把整个源码目录打进 VSIX。
- 按改动运行必要检查：`node scripts/check.js`、`node --test tests/extension.test.js tests/setup.test.js tests/runtime.test.js`、`python -B tests/package_validation.py`。涉及构建时执行 `python -B build.py --output dist` 与最终包审计。
- 验证记录明确实际通过、跳过与未验收项。CI 成功不是手机真机、真实 VS Code 宿主或市场公开发布的证据。
- 本项目使用 `codexAnyDevice.*` 和独立数据存储，不改 Beacon 的设置、Hook、证书或缓存。
