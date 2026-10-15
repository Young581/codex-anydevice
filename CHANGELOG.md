# Changelog

## 0.6.2 — 2026-10-15

- 首次正式 GitHub Release，汇总已完成的官方同步稳定性修复、记住 QQ 配对、原线程续聊、多项目切换、对话历史分页和精简管理面板。
- 每轮完成的修改提交并推送；main 三平台 CI 通过后自动创建版本 tag，并使用固定官方 `@vscode/vsce` 4.0.0 打包、审计和上传 Release 草稿。下载同包完成隔离宿主验证后公开发布，不覆盖旧 tag 或资产。
- 发布脚本核对精确提交、版本、源码载荷、上传/下载 SHA-256 与已审查哈希。GitHub Release 与 Marketplace 上架分别记录。

First public GitHub release, with persistent pairing, same-thread continuation, project switching, paged history and a simpler management panel. Completed changes now follow a committed push, version tag and audited release workflow.

## 0.6.1 — 2026-10-15

- 管理面板移除高级选项、环境认证摘要、手工身份登记、配置预览和开发原理说明；排障工具与清除配置移到命令面板。
- 保留项目授权、持久 QQ 配对、官方同步与恢复、续聊选择、历史分页、任务取消和结果查看。QQ 指令填入按钮保留为日常操作入口。
- 会话与当前任务分组显示，中英文文案改为使用说明；环境检查结果改为单独文档。

Simplified the management panel for everyday use. Troubleshooting moves to the command palette; pairing, projects, history, continuation and task controls remain available.

## 0.6.0 — 2026-10-15

- 增加最多 20 个本地项目目录，可浏览工作区之外的目录；逐目录电脑确认授权、移除和撤销，旧单项目配置保留。QQ `/projects`、`/project 编号` 切换已授权目录，无需重新配对，一次仍只运行一个任务。
- 各项目分别记住续聊目标，切换清除旧项目临时结果与列表，忘记配对、更换机器人或手工身份会撤销所有项目授权。
- 增加 `/sessions next`、`/history [编号]`、`/history next` 和电脑历史查看/翻页；按项目重新核对后经原生接口读取，只传用户/Codex 文字，每页最多 1400 字符，不恢复线程或发起模型请求。
- `/help`、`/` 和命令前缀返回匹配指令；可选 QQ Markdown 指令填入按钮限定发信人且 `enter:false`。自定义按钮需 QQ 权限，默认关闭；明确 HTTP 400/403 拒绝后回退文字，不重试不确定的发送。插件不接管 QQ 输入过程中的实时联想。
- 扩展合成测试、原生历史/项目隔离与最终包宿主验收；真实手机、QQ 按钮权限与真实模型仍单独验收。

Added authorized project switching, paged dialogue history and QQ command hints with optional input-only buttons. Pairing, exact approvals and native sandbox restrictions remain enforced.

## 0.5.1 — 2026-10-15

- 修复快速断开/重连时旧 QQ 连接失败误停新连接；已记住配对的离线页面和状态提示改为连接恢复。
- 独立 Codex 与手机共享通道复用逐记录 JSONL 解析，多个合法消息合并到达时不再误判超限，保留手机单条 1 MiB 上限。
- 环境检查等操作等待期间仍可取消正在运行的任务。
- 官方面板尚未挂载时重试公开会话导航，仍要求准确线程的后端加入证据；已有缓存线程以此前成功读取的证据判断，不放宽模型提交前的加载确认。
- 扩展隔离官方 GUI 回归，覆盖手机新任务、电脑同线程续聊、手机返回原线程、取消和恢复；真实 QQ 与真实模型验收仍单独记录。

Fixed reconnect races, per-record parsing, cancellation during setup work and official-panel readiness. Pairing and same-thread continuation remain available; actual phone and real model acceptance are tracked separately.

## 0.5.0 — 2026-10-15

- 新增 `/sessions`、`/use 编号` 与 `/continue 内容`，以及电脑选择续聊目标；限定授权项目的最近 10 条会话，在空闲原线程继续，保留上下文，不 fork、不接管运行中任务。
- QQ 首次配对并经电脑确认后，记住 AppID、OpenID 和项目授权，断开/重启无需再发配对码；旧版保存的身份可在电脑一次确认迁移，无需重复 QQ 配对。提供取消记住配对，更换项目需电脑重新授权。
- 保存最近创建或选择的续聊线程；更换机器人、手工修改身份或清除授权时移除目标，迟到确认不能恢复撤销的授权。
- 共享代理预留线程、检查运行中与提交中的桌面任务，保留准确审批路由、on-request/user 与原生只读策略；更新同步入口可刷新载荷并保留原设置备份。
- 增加隔离原生后端续聊/上下文/取消/桌面恢复/错误令牌验证；真实 QQ、真实模型与本轮官方 GUI 验收另列。

Added same-thread continuation and persistent QQ pairing, with explicit desktop migration for existing OpenID metadata. Native isolated validation uses an authenticated local model fixture; real phone/model and GUI acceptance remain separate.

## 0.4.1 — 2026-10-14

- 修复启用官方同步后打开较长桌面会话时代理退出、官方 Codex 显示启动失败的问题：桌面 stdio 单条 JSONL 上限由 1 MiB 提升为 256 MiB，手机通道限制保持不变。
- 消息大小按单条记录计算，多个合法消息合并到同一个数据块时不再误判超限；分片 UTF-8 按字节计数，协议失败后停止处理。
- 增加大历史转发及后续请求存活、合并记录、分片字节边界和手机上限回归检查；旧版已启用同步需先恢复入口，更新后重新启用以刷新生成代理。

## 0.4.0 — 2026-10-14

- 新增 Windows 官方 Codex 面板同步：手机任务运行时显示进度，完成后可在同一线程继续聊。锁定官方扩展 26.51007.21434 / CLI 0.162.0-alpha.17.2。
- 复用一个原生 stdio 后端，认证本机通道隔离 RPC ID 和手机线程占用，准确路由审批；QQ 断开不结束无关桌面任务。
- 保存官方入口原值并支持恢复；VSIX 只含审查的 C# 源码，本机编译启动器并设置私有存储 ACL。
- 连接自动检查环境与生成配对码，最后一次电脑确认合并身份和项目授权；高级资料移入折叠选项，状态不再用 3/3 暗示连接成功。
- 隔离官方宿主与认证模拟模型验收，真实 QQ / ChatGPT / API 复测仍单独记录。

## 0.3.3 — 2026-10-14

- 修复有效 workspace-write 被误判为策略不匹配：工作目录自动作为可写根，空 `writableRoots` 表示没有额外可写目录。
- 仍拒绝额外项目根、开启工具网络、临时目录额外写入及非用户审批策略；不修改 Windows 系统沙箱。
- 新轮次继承已核对的原生线程策略，不重建旧式沙箱描述，保留只读和更严格的原生读取限制。
- 使用 Codex 0.162.0-alpha.17.2、合成 Windows 配置和带认证的本机响应验证只读/workspace-write 两种新任务；真实 QQ 与模型执行仍需更新后复测。

## 0.3.2 — 2026-10-14

- 修复 Codex 启动、协议读取及进程中断时只留下“状态未确认”的诊断遗漏；电脑和 QQ 回复显示固定错误类别及任务阶段。
- 根据官方结构化错误区分认证/访问、额度、模型服务和沙箱失败；不展示原始错误正文、服务商地址或凭据。
- 确认尚未提交轮次或轮次被明确拒绝时显示失败；提交后的异常中断仍保留未确认状态，不假定回滚或自动重试。
- 最新匿名任务记录保留经过白名单检查的阶段和错误类别，重载后仍可排查；新任务清除旧原因，旧任务异步失败不覆盖新任务。
- 使用精确 Codex 版本、隔离项目与本机合成 Responses 服务核对正常完成和模拟认证拒绝；真实账号执行仍待验收。

## 0.3.1 — 2026-10-14

- 修复 QQ 网关只允许文档示例主机的兼容问题：支持腾讯官方 SDK 使用的 `api.sgroup.qq.com`，同时保留 `api.bot.qq.com`。
- 仅接受这两个主机的 WSS `/websocket` 接入点，继续拒绝未知主机、非标准端口、用户信息、附加参数与重定向。
- 连接地址不兼容时显示 transport/host/path/options 类别，不展示原地址、参数值或服务端错误正文；保存的配置继续使用。
- 使用合成网关验证兼容与拒绝边界；真实 QQ、手机和模型任务仍需验收，未公开发布。

## 0.3.0 — 2026-10-14

- QQ 官方单分片 WebSocket、token 刷新、心跳恢复与有界重试，无 OpenClaw。
- 短时配对码、电脑确认、自动取得 OpenID；手工登记和重启不自动授权。
- `/new` 独立新线程、`/status`、`/cancel`、结果回传与电脑查看。
- 精确协议 0.162.0-alpha.17.2，原生用户请求审批、准确/过期匹配、有效沙箱核对与只读限制保留。
- 有界去重、重启 unknown、不重放、单任务与跨窗口占用，配置变更撤销连接。
- 真实账号/手机及 ChatGPT/API 模型任务尚未验收，未公开发布。

## 0.2.3 — 2026-10-14

- 新增 QQ 身份用途、官方 `C2C_MESSAGE_CREATE` / `author.user_openid` 获取说明与向导入口。
- 手动录入移至高级选项，必须先保存机器人信息；没有 OpenID 时可先保留机器人与项目准备资料。
- 将手工填写的身份显示为“已登记，待验证”，区分身份登记、电脑确认配对与实际授权。
- 自动配对、QQ 消息接收和任务执行仍待实现；不要求个人用户为准备向导另建事件接收服务。

## 0.2.2 — 2026-10-14

- Codex CLI 认证检查区分 ChatGPT 登录和 API Key，未知方式保留为受限状态。
- 将“未登录”改为“未检测到 OpenAI 认证”，说明自定义服务商需单独核验，检测不代表当前编辑器会话或请求可用性。
- 认证未确认不阻止保存 QQ 与项目资料；不读取或修改模型密钥、Codex 认证/配置文件，不发起模型请求。
- 后续新任务验收加入订阅与 API 两种认证方式，QQ 直连执行仍待实现。

## 0.2.1 — 2026-10-13

- 默认路线调整为 QQ 官方机器人直接接 AnyDevice 与本机 Codex，面向个人单项目使用。
- 移除 OpenClaw 检测、网关健康检查、运行时设置、Node 版本要求与安装提示。
- 配置预览改为无明文密钥的资料摘要，移除旧网关的绑定命令，保留 0.2.0 凭据、身份和项目资料。
- 同步双语向导、隐私说明、架构、原型与维护方案；QQ 连接、消息收发和任务执行仍待实现。

## 0.2.0 — 2026-10-13

- 新增个人 QQ 配置向导和状态栏入口，中英文、主题跟随和窄窗口适配。
- 检测 Codex 登录、OpenClaw、Node 与本机网关；仅显示受限的版本和状态摘要。
- 原生密码框与 SecretStorage 保存机器人密钥，绑定一个 OpenID 和当前本地项目。
- 预览仅含 SecretRef 的配置片段；禁用群聊，指定明确聊天与审批身份；复制手机项目绑定指令。
- 支持保存进度、取消保留和确认清除；资料齐全不代表 QQ 链路已验收。
- 网关配置应用、凭据注入、网关启动和真实 QQ 消息执行尚未实现。

## 0.1.0 — 2026-10-13

- 建立 Codex AnyDevice 独立仓库与 VS Code 研发骨架。
- 完成 QQ、微信、OpenClaw 和官方 Codex 接口调研；优先验证手机新任务链路。
- 沿用 Codex Beacon 的仓库基础设置、三平台 CI、问题模板、白名单打包和发布审计方案。
- 手机通信、Codex 执行、已有会话交接与审批尚未实现。
