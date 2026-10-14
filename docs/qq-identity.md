# QQ 身份怎么获取

**0.3.2 自动取得身份，无需查找 QQ 号码或手填 ID。** 保存机器人信息和项目后，点击 **连接 QQ → 开始配对**，用本人 QQ 私聊发送页面上的 `/pair 一次性代码`，最后在电脑确认。

AppID/AppSecret 认证机器人，OpenID 识别发消息的用户。只接受配对后的本人私聊，防止其他人用机器人在电脑执行任务。Codex 请求审批在电脑处理，本版不接受 QQ 审批指令。

身份来自同一机器人收到的 `C2C_MESSAGE_CREATE` **外层** `author.user_openid`；WebSocket 封套为 `d.author.user_openid`。它不是 QQ 号码、昵称、AppID、群身份或 union OpenID，不能通过 QQ 号码推算。确认框只在本机显示真实 OpenID，不要贴到公开聊天或 Issue。

## 配对

机器人后台需允许本人测试/使用、WebSocket 与私聊。代码 5 分钟有效、最多 5 次尝试且只能用一次；拒绝或过期需重新开始。电脑显示真实发信人及项目，只有明确确认本人后才授权任务。无需另建消息接收服务。

重启、主动断开或修改配置后需重新配对，手工填过 OpenID 也一样。连接失败时可保留其他准备资料。

## 高级手工登记

已有官方事件接收程序的开发者，可从自己给**此机器人**的新私聊外层 `author.user_openid` 取得身份。保存机器人资料后展开 **高级：已取得 OpenID → 登记已有 OpenID**。仅登记资料、显示待验证，不自动授权；不得使用群聊或引用消息中其他人的身份。

合成字段示例：

```json
{ "t": "C2C_MESSAGE_CREATE", "d": { "author": { "user_openid": "synthetic_user_openid" } } }
```

## English

Version 0.3.2 obtains OpenID automatically: connect, start pairing, send `/pair CODE` from your own private QQ chat and explicitly confirm on the computer. The identity comes from the outer `author.user_openid` in your C2C event to the same bot. It is not your QQ account number. Manual metadata still needs pairing. Restarts and explicit disconnect revoke verification. Requested approvals stay on the computer.

## 官方依据

2026-10-14 实际获取[单聊事件](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/c2c_message_create.html)、[单聊发送](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_messages.post.html)与[事件订阅](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)。真实机器人和手机配对尚需验收。
