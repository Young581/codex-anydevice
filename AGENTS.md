# Codex AnyDevice 开发约定

- 用户已授权持续发布本项目：每轮修改完成并通过对应验证后，更新版本、CHANGELOG 与发布说明，提交并推送到 `.github/repository-settings.json` 声明的 `Young581/codex-anydevice` 的 main，不得只留本地。CI 自动创建新版本 tag 并上传 GitHub Release 草稿；继续下载同一 VSIX 做最终审计与隔离宿主验证，再用 `scripts/github-release.py --publish --expect-sha256 <已核对哈希>` 公开正式 Release。每轮交付包含 commit、tag、Release 链接与实际验证结果，无需重复询问发布许可。不得移动已发布 tag 或替换既有资产；新增修改递增版本。GitHub Release 与 Marketplace 分开记录，后者需要对应 Publisher 权限。普通用户管理面板只保留日常使用内容，技术原理留在文档、排障放到命令面板。
- 先看 `README.md`、`docs/roadmap.md`、`docs/setup.md` 与 `docs/architecture.md`。当前 0.6.0 增加最多 20 个本地目录、逐目录电脑授权、QQ `/projects` 和 `/project` 切换、分页 `/sessions` 与 `/history` 查看对话、前缀指令提示和可选 QQ 填入按钮。分别记住续聊目标，一次仅一个任务；新目录授权一次，配对不重复。保留 `/new`、`/use`、`/continue`、`/status`、`/cancel` 与准确电脑审批。核对 Codex 0.162.0-alpha.17.2 与官方扩展 26.51007.21434，使用 on-request/user，保留原生只读限制，共享原生 stdio，不加入 OpenClaw。历史通过原生接口按项目验证后只传用户/Codex 文字，不读取本地历史文件；测试只用合成会话。QQ 自定义按钮需权限，默认关闭、绑定发信人且不自动发送；无法接管 QQ 实时输入联想。0.5.1 的官方 GUI 合成验证和 syncNotReady 历史保留，新版验证见记录；不将合成模型当作真实账号验收。下一目标仍是实际机器人/手机与 ChatGPT/API 任务、写入、取消和审批验收。
- 沿用 Codex Beacon 的治理与发布约定，声明式设置位于 `.github/repository-settings.json`，维护与发布流程位于 `docs/maintenance.md`、`docs/releases.md`。
- 核对当前官方 Codex/腾讯渠道文档再修改集成；记录确切版本与证据。OpenClaw 只保留为历史调研，不进入默认用户流程。区分日志观察、分支续聊、原线程续聊与运行中接管。
- 不读取或提交真实会话、登录文件、私密身份、服务器地址或运行缓存。测试使用隔离合成项目与账号。
- 保留明确发信人/审批者身份、项目授权、准确请求匹配、去重和单线程写入约束；不得通过关闭认证、自动批准或模拟点击审批来通过测试。
- 新包内文件必须加入经过审查的 `packaging/package_policy.py` 与 `.vscodeignore`，不能把整个源码目录打进 VSIX。
- 按改动运行必要检查：`node scripts/check.js`、`node --test tests/extension.test.js tests/setup.test.js tests/runtime.test.js tests/direct.test.js`、`python -B tests/package_validation.py`。涉及构建时执行 `python -B build.py --output dist` 与最终包审计。
- 验证记录明确实际通过、跳过与未验收项。CI 成功不是手机真机、真实 VS Code 宿主或市场公开发布的证据。
- 本项目使用 `codexAnyDevice.*` 和独立数据存储，不改 Beacon 的设置、Hook、证书或缓存。
