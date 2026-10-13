# 架构与控制边界

此文为待实现设计，不是当前运行能力。

```mermaid
flowchart LR
  Phone[手机 QQ] --> Channel[QQ 官方机器人接口]
  Channel --> Adapter[AnyDevice QQ 连接与鉴权]
  Adapter --> Policy[身份与项目授权 / 会话路由]
  Policy --> Codex[原生 Codex app-server]
  Codex --> Project[允许执行的项目]
  Codex --> Adapter
  Adapter --> Channel
  Channel --> Phone
  VSCode[VS Code AnyDevice] --> Policy
  Policy --> VSCode
```

## 执行位置

第一版执行位于用户选择项目的本机。AnyDevice 直接连接 QQ 官方接口，用本机 stdio 调用 Codex app-server；手机使用腾讯消息渠道。QQ WebSocket 的实际账号准入需验证；Webhook 是需要 HTTPS 回调的另一种部署方式。电脑休眠、离线或 VS Code 退出后的行为必须明确显示。

新任务原型由扩展管理自己的 stdio app-server 连接和新建线程。连接生命周期跟随本地扩展宿主；关闭窗口或重载时停止接收新任务，正在执行的任务须按取消/未知状态记录，不能把断连视为完成。独立常驻服务属于后续可选场景，当前不增加用户安装步骤。

本地窗口在本地执行；Remote SSH/容器窗口对应其远端项目。尚未实现的远端部署不自动转回本机运行，不通过手机消息创建任意 SSH 连接。

## 模块边界

| 模块 | 责任 |
| --- | --- |
| VS Code 扩展 | 项目登记与授权、任务与会话列表、交接界面、配置与诊断 |
| QQ 渠道适配 | 腾讯官方鉴权、令牌刷新、事件订阅、心跳与恢复、原始身份和结果回传 |
| 扩展控制层 | 项目别名路由、权限、消息去重、并发与恢复；普通指令使用明确解析规则 |
| Codex 后端 | 官方 app-server 原生线程、轮次、审批与事件 |
| 状态存储 | 最小路由与操作状态；单独定义隐私保留与清理 |

0.2.1 已实现本地配置向导、状态栏、SecretStorage 凭据保存、项目选择与 Codex CLI 检测，保留 0.2.0 配置数据。配置摘要只描述准备资料和计划的授权，不能当作已经生效的访问控制。QQ 连接、控制层和 Codex 执行仍待实现；OpenClaw 不再属于运行路线。

## 身份、项目和请求

每个指令绑定 `channel + accountId + senderId + conversationId + projectId + threadId`；不得使用昵称或聊天标题作为身份。QQ OpenID 随机器人账号变化。默认私聊，允许聊天与允许审批分别管理。

手机仅传项目别名；项目路径由电脑端显式登记。跨项目和绝对路径输入不自动获得授权。每个原生 thread 只有一个可写控制者；文件修改以 Codex 自身权限和沙箱为基础，不接受任意 shell 文本作为网关命令。

消息 ID、操作 ID、thread ID 和 turn ID 分别记录；指令重放不能简单再次执行。重启后结果不确定的操作标为“状态未确认”，查证后继续。不能从网络层的确认推断项目已成功修改。

审批携带准确 request ID、thread/turn 和到期时间，只能由指定审批人回答；过期、已解决和错会话答复无效。拒绝或超时不能变成批准。异步提问的回复是续聊或 steer，不能套用阻塞工具审批语义。

## 状态

`queued → running → waiting_question / waiting_approval → running → completed / failed / cancelled`。断连或无法核实完成时使用 `unknown`。结束一轮只表示该轮结束；后台部署、训练等外部工作需另有证据。

## 与 Beacon 共存

使用 `Young581.codex-anydevice`、`codexAnyDevice.*` 和独立存储目录。Beacon 的历史、Hook、证书、隐私暂停和设置不被迁移或覆盖。未来若复用 Beacon 源码，必须保留原 MIT 版权并登记来源；本次骨架没有复制它的运行时代码。
