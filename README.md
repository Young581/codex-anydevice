# Codex AnyDevice

[English](README.en.md) · [配置与使用](docs/setup.md) · [调研](docs/research.md) · [开发路线](docs/roadmap.md)

用手机 QQ 给电脑上的 Codex 发起新任务或继续已有会话，在 VS Code 中选择项目、确认配对和处理审批。面向个人用户，不依赖 OpenClaw。社区项目，非 OpenAI、腾讯或 Microsoft 官方产品。

**当前 0.6.2 正式通过 GitHub Release 分发。** [下载安装包](https://github.com/Young581/codex-anydevice/releases/latest)。管理面板只展示配置、项目、连接和会话操作，排障入口移至命令面板，技术原理放在文档。支持多目录切换、历史分页和 QQ 指令提示/可选填入按钮；QQ 只需配对一次，每个目录分别记住续聊目标。机器人权限、手机实际收发、ChatGPT/API 真实任务仍需验收。尚未上架 VS Code Marketplace。

## 开始使用

1. 安装本地 VSIX，重载 VS Code，打开受信任的本地项目，点击状态栏 **Codex AnyDevice**。
2. 保存 QQ 官方机器人 AppID/AppSecret，**选择或添加项目目录**；可浏览未在工作区打开的本地文件夹。需要在官方面板看进度、历史和续聊时，先**启用官方 Codex 同步**，结束桌面任务并重载一次。升级用户点**更新官方同步入口**并重载。
3. 点击 **连接 QQ**，环境自动检查。首次未配对时，连接成功自动显示配对码。
4. 用本人 QQ 私聊机器人发送页面上的 `/pair 一次性代码`，在电脑一次确认身份与项目授权，之后自动记住 OpenID。旧版已有 OpenID 可点击 **记住已配对的 QQ**，只需在电脑确认一次，无需重新发送配对码。
5. 发送 `/new 读取 README，概括项目用途，不修改文件`。续聊用 `/sessions` → `/use 1` → `/continue 接着分析`，历史用 `/history`、`/history next`；也可在电脑选择并查看对话。用 `/status` 查询、`/cancel` 取消；审批在电脑逐条确认。

添加其他目录后，在电脑点 **授权此项目给已配对 QQ**，再连接。QQ 发 `/projects` → `/project 2` 即可切换已授权目录，无需重新配对。最多 20 个目录，一次只运行一个任务。`/sessions next` 查看更早会话，`/history 编号` 直接看列表中的对话且不改变续聊目标。

QQ 发 `/help`、`/` 或 `/c` 获取匹配指令；这需要发送消息后才返回提示。若机器人已获 QQ **自定义按钮权限**，可在管理面板“连接与配对”中启用 **QQ 指令填入按钮**，点击只填入输入框，不自动发送。输入过程中实时弹出的联想由 QQ 客户端控制，插件不能接管；权限及版本限制见[配置说明](docs/setup.md)。

电脑和 VS Code 必须保持运行。首次验收用不含秘密的合成项目。重启或断开后点击连接即可恢复已记住的配对，不重放任务；首次使用新目录需电脑授权，已授权目录之间切换无需重复授权。取消记住配对、更换机器人或手工修改身份会撤销所有目录授权。配置资料齐全不代表已连接，手工登记 OpenID 不自动授权。

官方同步仅核对 Windows、VS Code 1.141.0、`openai.chatgpt` 26.51007.21434。运行时自动打开新线程，完成后可在电脑继续聊；恢复原入口和具体边界见 [官方同步](docs/official-sync.md)。

## 兼容范围

采用 **QQ 官方机器人 → AnyDevice → 本机 Codex app-server**，无公网回调，支持单机器人、单发信人、多个已授权本地目录，一次只选一个项目和任务。续聊与看历史需启用官方同步；会话列表每页 10 条，历史每页最多 1400 字符，只显示用户与 Codex 的对话文字。续聊只接受当前项目的空闲原线程，不分支、不接管运行中任务。每个项目保存最近新建或选中的线程 ID，重连后可直接 `/continue`。Webhook、多分片、群聊与微信未实现。

当前核对的 Codex 为 **0.162.0-alpha.17.2**，其他版本会被拒绝启动。任务继承所选 CLI 的 ChatGPT/API Key、自定义服务商、模型与常规配置；插件不读取或改写登录/模型配置文件。API 任务可能计费。使用原生用户请求审批，不使用自动审批。若 Windows 原生运行时返回只读沙箱，任务保留限制并提示；项目写入需先在官方 Codex 完成沙箱设置。选定目录不是完整读取边界，越界请求应逐条审查。

结果仅在内存中保留最新一次的最多 20,000 字符，QQ 回传摘要；按保守 5 分钟窗口及单条源消息最多 4 次回复处理。长任务可能无法主动回传，请发 `/status` 或在电脑查看结果。完整边界见[架构](docs/architecture.md)和[隐私](PRIVACY.md)。

## 开发与维护

需要 Node 22+、Python 3.8+；QQ 直连需要具有原生 fetch/WebSocket 的近期 VS Code 扩展宿主，本轮宿主为 1.141.0。没有 npm 依赖。

```text
node scripts/check.js
node --test tests/extension.test.js tests/setup.test.js tests/runtime.test.js tests/direct.test.js
python -B tests/package_validation.py
python -B build.py --output dist
```

每轮完成的修改都会更新版本并提交、推送到 main。三平台 CI 通过后自动打 tag、使用官方 vsce 打包并上传 Release 草稿；下载同包完成审计与隔离宿主验证后公开发布。历史包不覆盖。Actions 默认只读，仅发布 job 获得必要的 `contents: write`；其余治理沿用 [Codex Beacon](https://github.com/Young581/codex-beacon)。见[发布说明](docs/releases.md)、[维护方案](docs/maintenance.md)与[验证记录](docs/verification.md)。

[贡献](CONTRIBUTING.md) · [安全报告](SECURITY.md) · [变更记录](CHANGELOG.md)
