# 构建与发布

用户已授权：每轮完成的修改都提交、推送到公开仓库 `Young581/codex-anydevice`，递增版本并发布 tag 和 GitHub Release，不再只留本地。当前版本 0.6.3，GitHub Release 与 VS Code Marketplace 上架分别记录。真实手机和模型验收未完成项如实写入说明，不再默认禁止 GitHub 分发。

## 每轮交付

1. 更新 `package.json`、CHANGELOG、README、`docs/release-notes.md` 与相应验证记录。后续修改递增版本，不覆盖已发布的 tag 或附件。
2. 完成对应检查并审阅暂存文件，确认没有凭据、真实会话、用户配置、运行缓存或测试产物。新增包内文件仍需两个审查白名单。
3. 提交并推送到 main。三平台 CI 成功后，发布 job 使用固定官方 `@vscode/vsce` **4.0.0** 打包、审计，创建准确提交的 `v<version>` 注释 tag，上传 Release 草稿的 VSIX、`.sha256` 与 `release-audit.json`。默认权限只读，只有发布 job 使用 `contents: write`；不在 PR 中发布，令牌不交给构建工具。
4. 用 `scripts/github-release.py --download dist/codex-anydevice-<version>.vsix` 下载同一包，核对哈希、源码载荷及最终审计，在隔离用户目录完成对应的真实 VS Code 宿主检查，只使用合成项目和账号。
5. 用 `scripts/github-release.py --publish --expect-sha256 <已核对哈希>` 公开正式 Release。这是已授权工作，无需重复询问；工具核对准确提交、附件和哈希。随后公开下载并复核，交付 commit、tag 和 Release 链接。

CI 上传后，由本轮维护者/编码代理继续完成同包验证和公开操作，不得把草稿报告为正式发布。重跑不移动 tag、不替换附件；版本属于另一提交或附件字节不同会失败，需递增版本。认证/权限失败应交代实际状态。

## 本地检查与开发包

```text
node scripts/check.js
node --test tests/extension.test.js tests/setup.test.js tests/runtime.test.js tests/direct.test.js
python -B tests/package_validation.py
python -B tests/release_validation.py
python -B build.py --output dist
python -B packaging/release-audit.py dist/codex-anydevice-0.6.3.vsix
```

离线开发构建只读取审查白名单并固定 ZIP 时间戳；正式包使用上述官方 vsce，两者不能混同哈希。不包含本机状态、凭据、测试输出或 `.git`。最终包审计身份、清单、敏感内容和源码逐字节一致性。

`scripts/github-release.py --prepare <已审计VSIX>` 可在 CI 受阻时用已登录的 Git Credential Manager 准备同样的草稿，仍需完成对应验证才公开。登录仅在进程内使用，不打印或保存令牌。

## Marketplace

GitHub Release 不需要 Marketplace 凭据。市场发布需核对 `Young581` Publisher 权限，再用 `vsce publish --packagePath <同一已审计包>` 或市场管理页上传并核对公开页面。GitHub 登录不代表拥有 Marketplace 权限；未完成时记为未上架，不阻挡 GitHub Release。

凭据只在凭据管理器、受控 Actions 令牌或进程环境中使用，不进入源码、命令或日志。发现发布包错误时发布新版本并说明影响，不静默替换旧包。
