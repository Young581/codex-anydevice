# Codex AnyDevice v0.6.3

用手机 QQ 给电脑上的 Codex 发起任务、继续已有会话并查看对话记录。首次正式 GitHub Release，安装包在本页附件下载。

- QQ 首次配对并在电脑确认后记住身份，重连和重启无需重新配对。
- 最多 20 个本地项目目录，逐目录电脑授权；QQ 用 `/projects`、`/project 编号` 切换，各目录分别记住续聊目标。
- `/sessions`、`/use`、`/continue` 继续当前项目的空闲原线程；`/history`、`/history next` 查看对话和翻页。
- 手机任务在官方 Codex 面板显示进度，完成后可在电脑继续聊；保留长历史加载修复和原入口恢复。
- 管理面板只保留日常使用内容；支持任务取消、结果查看、QQ 指令提示及可选填入按钮。
- 此后每轮完成的修改都提交、推送、递增版本并发布 tag/Release；历史包不覆盖。

安装附件中的 VSIX 并重载 VS Code。已启用官方同步的升级用户，请点击“更新官方同步入口”，结束电脑任务后再重载。QQ 配对与既有项目授权保留，新目录需在电脑授权一次。

兼容核对：Windows、VS Code 1.141.0、官方扩展 26.51007.21434、Codex 0.162.0-alpha.17.2。续聊和历史需要官方同步；电脑与 VS Code 须保持运行。保留原生访问限制与逐条电脑审批。

验证范围包括合成测试、打包审计及隔离 VS Code 宿主。真实 QQ 手机收发、QQ 按钮账号权限、ChatGPT/API 真实任务与写入审批仍待验收；GitHub Release 不代表已上架 VS Code Marketplace。

Each asset includes SHA-256 verification. This release supports personal QQ pairing, authorized project switching, same-thread continuation and paged dialogue history. Real phone and model acceptance remain tracked separately.
