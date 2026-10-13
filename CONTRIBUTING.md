# 开发与贡献 / Contributing

范围明确的改动和可复现的问题反馈均可。不要提交真实会话、用户设置、Codex Home、QQ/微信/OpenClaw 凭据、服务器信息、测试缓存或私人日志。

Use synthetic fixtures and redact diagnostics. Never commit credentials, user settings, real sessions, personal host information or generated test state.

## 验证 / Checks

需要 Node 22+ 与 Python 3.8+，无需 npm install。

```text
node scripts/check.js
node --test tests/extension.test.js tests/setup.test.js tests/runtime.test.js
python -B tests/package_validation.py
python -B build.py --output dist
```

新增包内文件先审查，再加入 `packaging/package_policy.py` 与 `.vscodeignore`。不要自动把整个目录加入包。改权限、队列、会话或审批时补充有意义的边界测试；文档和小型可逆 UI 修改按风险选择验证。

Describe what changed, why, the checks performed and any unverified platforms. Test adapters with synthetic identities. Do not disable authentication to make tests pass. See [architecture](docs/architecture.md) and [release process](docs/releases.md).
