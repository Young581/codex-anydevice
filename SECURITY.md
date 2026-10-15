# 安全报告 / Security reporting

不要在公开 Issue 中附上令牌、原始会话、QQ/微信身份、服务器信息或未修复漏洞的利用细节。

本仓库沿用 Beacon 当前基础设置，私密漏洞报告入口未启用。请先创建**不含细节**的问题，说明需要私密联系渠道；维护者提供渠道后再发送最小合成复现。若将来启用 Security Advisories 的私密报告，本文同时更新。

重点维护身份认证、项目边界、审批匹配和重放防护。仅最新正式版本常规维护，不承诺固定响应时间。目前 0.6.0 为 QQ 直连原型，包含持久配对、电脑逐目录授权、多目录切换、分页对话查看、空闲原线程续聊与电脑请求审批；实际账号/手机/模型任务待验收。手工登记不自动授权，新目录必须电脑确认，忘记配对会撤销所有目录授权，运行线程互斥。历史每页重新核对项目，只传用户/助手文字；指令填入按钮绑定发信人且不自动发送。摘要不是实时连接权限，目录不是完整读取边界。

Do not publish credentials, real sessions, private identities, host details or undisclosed exploit instructions. Private vulnerability reporting is currently disabled to match the Beacon baseline. Open an issue without sensitive details requesting a private contact channel, then provide a minimal synthetic reproduction privately. No fixed response time is promised.
