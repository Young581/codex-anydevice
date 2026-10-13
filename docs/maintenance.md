# 仓库设置与后续维护

基线：2026-10-13 实际读取 `Young581/codex-beacon` 的 GitHub 设置；本地参考提交 `6e2398957321ff94db59592357db57ec9fa44abd`。`github-publish` 的 README 含历史上游内容，本仓库采用 Beacon 当前独立身份与公开维护方式。

## 基础设置

| 项目 | 沿用 Beacon 的设置 |
| --- | --- |
| GitHub | `Young581/codex-anydevice`，公开，默认 `main` |
| 许可与身份 | MIT、Young581；独立插件 ID 与命名空间 |
| 功能开关 | Issues、Projects、Wiki 开启；Discussions 关闭 |
| 合并 | Merge、Squash、Rebase 开启；自动合并、自动删除分支、Update branch 关闭 |
| 分支规则 | 基线没有 main 保护与 ruleset；本仓库一致，不宣称已强制 PR 或必需检查 |
| Actions | 启用全部 Actions；默认只读；不允许工作流批准 PR；CI 显式 `contents: read` |
| 安全设置 | Secret scanning 与 push protection 开启；Dependabot security updates 关闭 |
| 私密漏洞报告 | Beacon 基线关闭，本仓库一致；不能把 Security 文档入口描述为已启用 |
| 标签、主题 | 使用 Beacon 的默认标签及其描述/颜色；topics 为空 |
| 文档与反馈 | 中英文 README、安全/隐私/贡献说明、Bug 和功能建议表单 |
| 验证与打包 | Windows/Linux/macOS、合成数据、明确文件白名单、最终 VSIX 哈希复核 |

声明式配置位于 `.github/repository-settings.json`。`python -B scripts/github-settings.py --check` 查询远端并返回差异；`--apply` 只应用该文件声明的设置，不删除已有分支保护、规则或额外标签，差异需单独审查。工具使用当前 Git Credential Manager 登录，不保存或打印令牌。首次创建使用 `--create --apply`，对已有仓库拒绝再次创建。

若指定账号的缓存查询未命中，工具会尝试现有默认缓存，并核对 GitHub 返回的账号确实是声明的仓库所有者；账号不符时不创建或修改仓库，也不自动发起登录。

这份基线保留 Beacon 实际设置。今后是否增加分支保护、自动依赖更新或私密漏洞报告，通过具体改动说明调整，不把未启用的能力写成已生效。

## 日常维护

问题先分类为渠道、原生 Codex、VS Code、权限或打包。反馈模板收集版本、消息渠道、窗口类型、复现与脱敏摘要。使用默认 `bug`、`enhancement`、`documentation` 等标签；安全细节不进入公开 Issue。

每次修改记录实际行为、验证范围及未验证项。改消息/审批协议必须检查跨会话、重复与过期请求；改 UI 做隔离宿主与窄屏检查；改打包清单复核源码来源、敏感文件和最终包。纯文字修改不增加镜像实现的测试。

建议每周整理反馈与版本兼容问题，每月核对官方 Codex、OpenClaw 及腾讯插件的接口/权限变化。账号、消息配额和插件版本问题按实际证据处理，不承诺固定响应期限。只有最新正式版本进入常规维护，必要安全修复说明受影响范围。

当前没有 npm 依赖，因此不添加无实际作用的 npm 更新任务。引入依赖时提交锁文件、核对来源/许可并更新兼容矩阵。OpenClaw 和腾讯插件属于用户部署的外部运行时，不捆绑进 VSIX。

## 发布纪律

开发用离线 VSIX 与正式发布分开。正式发布按 `docs/releases.md`：检查 → 锁版本 → 官方 vsce → 同包审计 → 隔离宿主 → Release/市场上传 → 下载复核。发布记录写入 `docs/verification.md`；模型任务只在专门原型验收阶段运行，不在普通 CI 里消耗账号额度。
