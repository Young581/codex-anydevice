# 构建与发布

0.3.3 为 QQ WebSocket 新任务原型，渠道与模型验收尚未完成，本次不创建正式 Release 或上传 Marketplace。

## 开发包

```text
node scripts/check.js
node --test tests/extension.test.js tests/setup.test.js tests/runtime.test.js tests/direct.test.js
python -B tests/package_validation.py
python -B build.py --output dist
python -B packaging/release-audit.py dist/codex-anydevice-0.3.3.vsix
```

离线构建只读取 `packaging/package_policy.py` 的白名单，固定 ZIP 时间戳，不包含本机状态、凭据、测试输出或 `.git`。CI 上传 Windows 生成的开发包；Linux/macOS 同样验证和构建。

## 第一次正式发布

1. 完成拟发布范围的功能、渠道真机与隔离 VS Code 宿主验收，明确平台支持等级。不要把骨架包装成已能手机操控的产品。
2. 同步 `package.json`、CHANGELOG、README 和验证记录中的版本。添加经审查的图标与包内文件，更新白名单及审计。
3. 用官方 `@vscode/vsce` 打包。因当前无 npm 依赖，使用 `vsce package --no-dependencies --out dist/codex-anydevice-<version>.vsix`。vsce 版本与依赖在发布环境固定并记录。
4. 审计最终 VSIX，记录 SHA-256；使用 `release-audit.py --expect-sha256 <reviewed-hash>` 再核对相同字节。该工具也接受官方 vsce 的文档文件名规范化。
5. 在隔离用户数据目录安装**这份**包完成真实宿主验证，使用合成会话与项目，不恢复用户实际聊天。
6. 发布前核对当前登录账号拥有 `Young581` Publisher。使用 GitHub Release 附上同一 VSIX 与校验值，然后用 `vsce publish --packagePath <audited-vsix>` 或 Marketplace 管理页上传同一包。当前没有自动发布工作流或发布凭据。
7. 从公开页面下载并校验版本、SHA-256 与载荷。上传受理、CI 成功和正式公开上线分别记录。

市场凭据保存在登录会话、凭据管理器或发布进程环境；不写入源码、工作流明文、命令或日志。GitHub 登录不代表有 Marketplace Publisher 权限。

验证发现发布包错误时，停用有问题的功能并修复发布新版本，公开说明范围；不得静默替换已经记录哈希的包。
