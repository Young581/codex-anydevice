# QQ 身份怎么获取

**你可以先跳过这一步。** 0.2.3 还没有连接 QQ，不能自动取得身份或完成配对。先保存机器人信息、选择项目即可保留准备进度；身份仍显示“待配对”，不会因此开放任务执行。

## 为什么要登记身份

AppID/AppSecret 让插件以机器人的身份连接腾讯；用户 OpenID 用来辨认发消息的人。插件需要知道哪些消息是你发的，才能把任务请求和审批回答限制为本人。两者作用不同，机器人密钥不能代替用户身份授权。

向导中的 OpenID 是 QQ 官方单聊事件的 `author.user_openid`，不是 QQ 号码、昵称或 AppID，也不应使用群聊的 `member_openid`、`group_openid` 或跨应用的 `union_openid`。不能通过 QQ 号码换算。只能使用自己向**同一个机器人**发送消息得到的身份；更换 AppID 后重新取得，插件会清除旧登记。

## 个人用户现在怎么做

1. 尚未创建机器人：先在 [QQ 开放平台](https://q.qq.com/)创建官方机器人，按后台实际权限配置测试/使用账号，再在向导保存 AppID/AppSecret；密钥只填本机密码框。
2. 尚未接入消息：先选择项目并保留进度，无需为了完成向导另外搭建事件接收服务，也不用填写 QQ 号码或猜测 ID。当前插件不能自动取得 OpenID，“QQ 身份怎么获取”按钮只打开本说明。
3. 后续接入的自动配对流程计划为：电脑开启短时配对 → 本人 QQ 私聊机器人发送一次性配对码 → 插件从腾讯事件取得 OpenID → 电脑明确确认 → 保存允许身份。实现后无需查找或手填 OpenID；当前版本尚无配对码或配对指令。

## 已有机器人接收程序时的手动获取方式

这条途径仅供已经能接收自己机器人事件的开发者使用，不是个人用户现在必须完成的步骤。

1. 确认该机器人后台允许本人测试/使用与单聊事件。按腾讯官方[事件订阅说明](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)接入已获准的 WebSocket 或 Webhook，订阅 `GROUP_AND_C2C_EVENT` 中的 `C2C_MESSAGE_CREATE`。Webhook 需要实际可用的 HTTPS 回调，不能仅在手机发消息就取得 ID。
2. 用本人的 QQ 向该机器人发一条普通私聊消息，例如“测试”。不会因为这条消息自动授权或执行 Codex 任务。
3. 在自己的事件接收程序中检查这一条新消息的**外层发信人** `author.user_openid`；不要取转发/引用消息内其他人的 `author`。WebSocket 完整事件封套中通常为 `d.author.user_openid`；SDK 已取出事件体时为 `author.user_openid`。
4. 回到向导展开 **高级：已取得 OpenID**，选择 **登记已有 OpenID**，填入本机。登记只保存计划的允许身份，页面标为“已登记，待验证”，不代表配对或访问控制已验收。

下例是合成的 WebSocket 事件字段片段，省略消息正文和其他字段：

```json
{
  "t": "C2C_MESSAGE_CREATE",
  "d": {
    "author": {
      "user_openid": "synthetic_user_openid"
    }
  }
}
```

不要把真实事件正文、OpenID 或密钥粘贴到公开 Issue 或聊天中。手动录入错误无法仅凭字符串格式验证，正式执行前仍需电脑确认配对与真实身份拒绝验收。

## English

You can skip this step for now. Version 0.2.3 does not connect to QQ or pair a user yet; bot and project details can be saved independently. Identity authorization is necessary to restrict task requests and approvals to you. The bot credentials authenticate the bot; they do not authorize every sender.

The user OpenID comes from the outer sender's `author.user_openid` in your own `C2C_MESSAGE_CREATE` event to the same bot. It is not a QQ account number, nickname, AppID, group/member OpenID or union OpenID. A QQ account number cannot be converted into it.

If your existing bot receiver already handles official events, send a private message from your own QQ and inspect `d.author.user_openid` in a WebSocket envelope, or `author.user_openid` in the decoded event body. After saving bot credentials, expand **Advanced: I already have an OpenID** to record it locally. It is recorded metadata, pending verification. Ordinary users do not need to build a receiver just to prepare this wizard.

The planned automatic flow is: open a short-lived pairing window on the computer, send a one-time code to the bot from your own QQ, receive the sender OpenID, and explicitly confirm on the computer. This is not implemented yet. No current pairing command or code is available.

## 官方依据

2026-10-14 实际获取腾讯官方 [单聊消息事件](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/c2c_message_create.html)（页面标注更新于 2026-09-16）、[发送单聊消息](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html)（页面标注更新于 2026-09-03）及[事件订阅说明](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)。字段来源与拟实现的配对流程分别说明；未接触真实账号或事件。
