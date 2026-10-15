# 个人 QQ 直连配置与使用

0.6.2 从 [GitHub Releases](https://github.com/Young581/codex-anydevice/releases/latest) 下载正式 VSIX。保留精简管理面板、多个已授权项目目录、历史分页、QQ 指令提示/可选填入按钮、原线程续聊和持久配对。真实机器人接入、手机收发、QQ 按钮权限及模型任务仍需验收。

## 准备电脑与机器人

安装本地 VSIX 并重载 VS Code，打开受信任的本地项目，点击状态栏 **Codex AnyDevice** 或运行 **打开管理面板**。Remote SSH、容器与虚拟工作区本版不支持。

**检查 Codex 环境** 仅运行版本和 `login status`，提供有界摘要，不发起模型请求。ChatGPT 登录和 API Key 都由 Codex 支持；未检测到 OpenAI 登录不代表自定义服务商不可用，也不等于当前编辑器会话的认证。任务使用所选 CLI 自己的认证、模型与服务商，API 使用可能计费，AnyDevice 无需再次填写模型密钥。

Codex 从 PATH、Windows npm 入口或已安装 OpenAI 扩展发现，也可手动指定绝对路径。原型仅核对 **0.162.0-alpha.17.2**，其他版本安全拒绝。npm 入口使用其需要的 Node，调用不经过 shell。QQ 连接需要近期 VS Code 的原生 fetch/WebSocket，缺少能力会提示更新。

在 [QQ 开放平台](https://q.qq.com/)创建官方机器人，按后台要求允许本人测试/使用及私聊。密钥只填本机密码框，保存在 SecretStorage，不进入网页、摘要或日志。更换 AppID 清除旧身份，0.2.x 配置继续使用。

QQ 文档列出 WebSocket，但账号权限以实际连接为准。本版支持 `api.bot.qq.com` 与腾讯官方 SDK 使用的 `api.sgroup.qq.com` 的单分片 WSS `/websocket` 接入点；其他主机、路径和附加参数保守拒绝，未实现需要 HTTPS 回调的 Webhook。

若 0.3.0 显示“QQ 返回了当前未核对的连接地址”，安装 0.4.0 并重载 VS Code 后重新连接，已保存的机器人与项目配置继续使用。若仍失败，只需反馈页面中的 `transport`、`host`、`path` 或 `options` 类别，无需发送完整连接地址、参数或密钥。插件不会自动改写地址或绕过校验。

## 连接并自动取得身份

1. 点击 **选择或添加项目目录**，从工作区、已保存项目或 **浏览其他项目目录…** 选择本地文件夹，保存其真实目录。
2. 点击 **连接 QQ**，自动检查环境，等待 **QQ 已连接**。首次未配对时尚未授权手机任务。
3. 首次连接成功自动显示 `/pair 一次性代码`，5 分钟有效、最多 5 次尝试。
4. 用本人 QQ **私聊**机器人发送该命令；电脑显示真实发信人的 OpenID 和项目，确认刚才是自己发送后点击 **确认本人并授权项目**。
5. 页面显示 **本人 QQ 已配对**，机器人返回命令说明；确认后的身份与项目授权会保存在本机。

身份来自 `C2C_MESSAGE_CREATE` 的外层 `d.author.user_openid`，**无需 QQ 号码或手工找 ID**。群聊与引用身份无效。旧版已保存 OpenID 时，可点 **记住已配对的 QQ**，核对电脑显示的身份与项目后确认，无需再次从 QQ 发送代码。手工登记仍需电脑显式确认或代码配对，不自动授权，见[身份说明](qq-identity.md)。拒绝、过期或已使用的代码需重新开始。

主动断开、重载、重启或连接失败后，点击 **连接 QQ** 即恢复已记住的配对；不会自动连接或重放任务。切换项目保留身份，新目录需电脑授权一次，已授权目录之间不重复授权。更换 AppID、手工修改身份、清除配置或 **取消记住的 QQ 配对** 会撤销所有目录的持久授权与续聊目标。同一机器人多窗口连接会被占用检查拒绝；修改 Codex 路径会断开连接。

## 添加和切换不同目录

首次配对后，再点击 **选择或添加项目目录**，选择另一个本地文件夹（不必已在工作区打开）。点击 **授权此项目给已配对 QQ**，在原生电脑确认框核对身份与真实目录。若尚未授权，点击连接也会要求电脑确认。保存目录本身不会授权。

最多保存 20 个项目。授权完成后重新连接，在 QQ 发送 `/projects` 查看编号，`/project 2` 切换。只接受电脑已登记且授权的编号，不从 QQ 接受任意路径。运行中需先完成或取消任务；一次只执行一个项目的一个任务。各目录分别记住最近新建/选择的续聊目标，切换会清除旧目录临时列表、历史翻页和结果；去重记录保留。

电脑 **移除此项目** 会移除该目录的授权与续聊目标，不删除项目文件或 Codex 历史。已保存的 0.5.x 单项目配置自动迁移，已有授权与目标保留。目录删除、链接目标变化、身份或信任变化时仍会拒绝执行。

## 官方面板显示和电脑续聊

需要在官方 Codex 中看运行进度并继续聊时，首次点击 **启用官方 Codex 同步**，确认保存原入口，结束桌面任务后重载 VS Code。后续 `/new` 自动打开官方会话，完成后可在同一线程输入后续问题。同步目前锁定 Windows 与官方扩展 26.51007.21434；**恢复原 Codex 入口** 可撤回。卸载前先恢复并重载。详见 [同步边界](official-sync.md)。

若旧版启用同步后打开较长桌面会话出现“Codex 启动失败”或进程退出码 1，可先 **恢复原 Codex 入口** 并重载。安装 0.6.2 后点击 **更新官方同步入口**（未启用时显示启用按钮），结束桌面任务并重载，确保替换已生成的旧代理。无需清理会话或登录文件；保留 0.4.1 的合成大历史修复，真实故障仍需更新后复测。

## 新任务与续聊指令

| 指令 | 行为 |
| --- | --- |
| `/projects`、`/project 编号` | 列出并切换电脑已授权目录，分别保存续聊目标 |
| `/new 任务内容` | 在授权项目中创建独立 Codex 新线程，一次一个任务 |
| `/sessions`、`/sessions next` | 当前项目会话每页 10 条，可翻到更早的会话 |
| `/use 编号` | 从最近列表中选择目标，重新核对项目与空闲状态 |
| `/history`、`/history 编号`、`/history next` | 查看所选/列表内对话及翻页，不改变续聊目标、不发起模型任务 |
| `/continue 内容` | 在所选原线程继续，不创建分支；需要官方同步 |
| `/status` | 返回最近任务 ID 与状态，不重放、不创建模型请求 |
| `/cancel` | 请求中断，确认前显示正在取消 |
| `/help`、`/`、`/c` | 帮助或按前缀匹配指令，发出消息后返回提示 |

首次请在无秘密的合成项目发送：

```text
/new 读取 README，概括项目用途，不修改任何文件，不运行命令。
```

续聊示例：`/sessions` → `/use 1` → `/continue 继续分析刚才的问题`。也可在电脑点 **选择续聊会话**。最近创建或选中的线程 ID 保存在本地，重连后可直接 `/continue`；`/new` 始终另建线程。只续聊当前授权项目的空闲会话，运行中的桌面或手机任务会被拒绝，不做运行中接管。

核对接收、运行、结果及实际文件。写文件、运行命令、ChatGPT/API 两种任务另行验收。电脑和 VS Code 必须保持运行；本版不支持 fork、手机审批、提问回复、群聊、附件或多任务并行。

## 查看之前的对话

启用并更新官方同步入口后，`/sessions` → `/history 1` 可直接查看某条对话；也可先 `/use 1` 后 `/history`，或在电脑 **选择续聊会话** 后点 **查看所选对话**。`/sessions next` 翻到更早会话；`/history next` 或电脑 **下一页对话** 继续阅读。

历史从最近轮次向前浏览，同一轮内保持用户和 Codex 的消息顺序，长文本连续分页，每页最多 1400 字符。仅显示用户文字和 Codex 回复，不包含工具结果、推理、附件、登录信息或本地历史文件路径。历史只经官方接口读取，不启动模型或恢复线程；查看某个编号不改变 `/continue` 目标。历史正文只暂存内存或打开未保存电脑文档，QQ 查看时正文会经过腾讯平台，请选择适合传输的对话。

## QQ 上的指令提示与自动填入

输入框内实时联想由 QQ 客户端/机器人后台能力控制，VS Code 插件收不到尚未发送的文字，不能提供类似编辑器的实时 Tab 补全。可直接发 `/help`、`/` 或 `/c`，机器人返回匹配命令，复制并补上参数后发送。

若机器人已获得 **自定义按钮** 权限，在管理面板 **连接与配对** 中点 **启用 QQ 指令填入按钮**（对应设置 `codexAnyDevice.commandButtons`）。随后帮助、前缀提示和部分导航消息会附带 QQ 指令按钮；点击将命令填入输入框，再自行补全参数并发送。按钮绑定已配对的发信人，`enter:false`，不会自动执行或替代审批。默认关闭，普通文字提示无需按钮权限。

腾讯当前文档说明单聊自定义 Markdown 已开放，但自定义按钮仍标注“内邀开通”；按钮模板须申请。按钮是否可用需以机器人账号权限和 QQ 客户端版本实测。明确收到 HTTP 400/403 拒绝时，本次连接回退为纯文字；网络超时等不确定发送不会自动重发。

## 收到任务后失败或状态未确认

“已收到任务”表示指令已接收，还不代表 Codex 完成任务。电脑页面、QQ 最终回复和 `/status` 显示阶段与固定原因；0.5.0 已记住的配对在更新重载后保留。

| 提示类别 | 下一步 |
| --- | --- |
| version / spawn / exit / connection | 检查所选 Codex CLI 能否正常启动及版本，反馈类别和任务阶段 |
| authentication / limit | 核对所选 CLI 的登录、API 授权或额度；在 CLI 中处理，无需把模型密钥填入插件 |
| provider / parameters / request | 核对所选 CLI 的模型/服务商配置与兼容性，反馈类别和任务阶段 |
| protocol / timeout / sandbox / task | 反馈类别和任务阶段；沙箱设置在官方 Codex 中处理 |

旧版的未知记录无法补回当时的失败原因。若没有最终结果，先核对本机任务和项目状态，再发新任务；插件不会自动重放或宣称修改已撤销。无需发送完整地址、原始日志、登录文件或密钥。

若 0.3.2 在“创建新线程”阶段提示“Codex 未返回预期的沙箱与用户审批策略”，先安装 0.4.0、重载、重新连接和配对，再发一个新任务。旧版误将有效 workspace-write 的空额外可写目录列表视为错误；0.4.0 已修复这一兼容问题。保存的机器人、项目与 Codex 路径继续使用。其他策略不匹配仍会停止任务，更新后的真实执行结果需复测。

## 电脑审批与沙箱

Codex 请求审批时，原生确认框显示准确 request/thread/turn/item，以及命令或可用文件变更。仅 **允许此条请求** 表示明确允许；关闭、拒绝或 2 分钟到期均不允许。已解决、跨线程、取消后的窗口不能批准新请求。

使用 `on-request` 与 `approvalsReviewer: user`；是否需要审批由 Codex 决定，正常沙箱内操作并非每次弹窗。不使用自动审核、会话级缓存批准或持久规则。完整请求太大、文件审批缺少内容、会话级 grantRoot、终端输入、权限工具、动态工具、MCP elicitation 与用户提问等未支持请求会拒绝或停止任务。

请求 workspace-write、单项目根、工具网络关闭及临时目录额外写入关闭，检查原生返回的有效策略后才提交任务。工作目录自动包含在可写范围中，额外可写目录列表可为空。轮次继承已核对的线程策略，保留原生读取规则；原生若返回更严格的只读沙箱，任务保留该限制并提示。Windows 如需项目写入，请在官方 Codex 完成其沙箱设置。插件不代改系统沙箱或登录文件。所选工作目录不是完整读取边界；越界请求可能授予该次命令更广权限，需审查完整内容。

## 排障入口

日常使用无需修改高级设置。按 `Ctrl+Shift+P` 搜索 `Codex AnyDevice`，可找到 **检查 Codex 环境**、**排障：指定 Codex 路径**、**排障：登记已有 QQ OpenID**、**排障：预览配置摘要** 和 **清除本插件的配置**。环境检查在单独文档显示版本和认证摘要，不在管理面板常驻。首次配对自动获取 QQ 身份，通常无需手工登记；登记后仍需在电脑确认授权。

## 结果与撤销

最新 agent 结果仅在内存保留最多 20,000 字符，**查看本次结果** 打开未保存文档。QQ 返回最多 1,400 字符摘要；源消息按保守 5 分钟期限、最多 4 次回复处理。过期/失败显示回传未确认；长任务请再发 `/status`，正文在电脑查看。

终止连接失败会断开实时授权、停止拥有的进程、释放占用，将未确认任务标为 unknown；已记住的配对仍保留。重启保留匿名去重记录与最近任务 ID/状态，不重放。取消超时或意外退出不宣称文件变化已撤销。

预览仍是资料摘要，`requiresLivePairing` 表示是否缺少持久身份确认，`projectAuthorized` 表示所选项目授权；均不代表 QQ 当前已连接。清除经电脑确认后断连，移除本插件密钥、身份、项目、续聊目标与任务记录，保留拒绝旧事件的时间截断。导出文档、Codex 保存的线程、QQ 消息与机器级运行时路径需自行管理。密钥删除失败会报告未完成，连接已撤销。

## English

Save official bot credentials, select a trusted local project, connect and pair once from your own QQ. Confirm on the computer to remember your OpenID and project grant. Existing OpenID metadata can be confirmed here without a new QQ code; manual entry never auto-authorizes. Use `/new TASK`, `/sessions`, `/use NUMBER`, `/continue MESSAGE`, `/status`, `/cancel`. Continuation requires official sync and an idle thread in the authorized project; no fork or active-task takeover. Existing CLI authentication/model/provider applies; API calls may incur charges. Verified version: 0.162.0-alpha.17.2.

Authorize each local folder once on the computer, then switch with `/projects` and `/project NUMBER`. Each folder retains its own target; one task runs at a time. Use `/sessions next` and `/history [NUMBER|next]` for older threads and dialogue. QQ input buttons are optional, require custom-button permission and fill input without sending; live typing suggestions belong to QQ. Requested approvals stay on the computer and require exact matching. Native read-only policies are preserved. Forgetting pairing or changing bot/identity revokes every folder grant. Real phone, button permissions and subscription/API execution remain unverified.

## 官方依据

2026-10-14 重新获取 [Codex App Server](https://learn.chatgpt.com/docs/app-server.md)、[QQ 鉴权](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/api-use.html)、[事件与连接](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)、[单聊事件](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/c2c_message_create.html)与[单聊发送](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html)，并以精确版本生成 schema、隔离初始化/线程返回核对，见[原型证据](qq-direct-poc.md)。

2026-10-15 再次获取 App Server Markdown 页面，核对 `thread/turns/list`、`itemsView: full`、游标和只读历史流程；以固定版本 schema/合成后端验证。QQ 重新获取[单聊发送](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html)、[Markdown](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/markdown.html)与[消息按钮](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/trans/msg-btn.html)，核对指令按钮 type 2、指定用户权限、data 与 enter:false。猜测的指令配置 URL 返回通用接入页，不作为实时补全的依据。
