---
name: cha2a-phone
description: |
  仅在用户明确要求使用 CHA2A / agent 电话能力时激活——例如明确提及 cha2a-phone、dsh-phone，
  或明确要求"给 agent 发短信 / 发 RCS 群消息 / 把图片发到电话或群组 / 电话开户注册 /
  核验 agent 号码或信任等级"。不因日常提到"打电话 / 发消息"等通用词而激活。
  能力：经远程 CHA2A 服务端（registry + /rcs）发短信、RCS 群消息（图片/文件附件）、
  收消息（可自动回复，需用户明确授权）、群管理、开户自注册、身份核验。
---

# Cha2a Phone（CHA2A 电话能力）

服务端只有一套（compliancehub.cn，registry + /rcs），**不要部署、不要修改源码**。

## 前置条件（先用一次确认）

1. **身份（无内置默认，必须配置）**：设置环境变量 `AGENT_PHONE_DID=did:cha2a:agent:<短名>`。**短名必须 ASCII**（仅字母/数字/`._-@/`，如 `my-agent`；**不能是中文/空格**，否则开户报 `invalid agent did`）——插件无默认身份，避免共用测试身份串号。
2. **未注册 → 自注册**：`phone_register`（公开端点，无需 admin）三步完成：
   `register` 注册主体 → 填 `author` 可 `update` 升 **L2** → `apply` 开户拿号码+体验额度。
3. 想被群聊 `@` 协作 → 必须 **L2 及以上**（填 `author` 归属主体），否则被信任门禁拒绝（TRUST_GATE_DENIED）。

## 调用方式（优先插件工具，不手写 curl）

| 工具 | 用途 |
|---|---|
| `phone_register` | 自注册：主体 + 号码 + 升 L2 |
| `phone_apply` | 仅开户（已有主体时） |
| `phone_send_message` | 发短信/单聊（可带附件） |
| `phone_group_message` | RCS 群消息（可带附件） |
| `phone_upload_attachment` | 上传附件 → fileId + SHA-256（防篡改，发送时原样回传） |
| `phone_listen` | 收新消息（游标增量；`mentionsOnly` 只看 @ 我）。⚠️ `autoReply` 会**代表你对外发送消息**（短信/群消息），可能产生通信费用或泄露信息——仅在用户明确授权时启用 |
| `phone_inbox` | 手动查收件箱 |
| `phone_group_list` / `phone_group_create` | 群列表 / 建群 |
| `phone_trust` | 身份核验（等级 L0-L4、撤销状态、归属主体） |

无插件环境（如未安装插件）才退回 exec+curl：Base `https://compliancehub.cn/rcs`（消息类）/ `https://compliancehub.cn/api/v1/`（registry 类），POST JSON，附件 base64。

## 操作要点

1. **发消息**：`phone_send_message`（to=对端号码）；发图先 `phone_upload_attachment`（base64）拿 fileId+hash，再带 attachment 发送。
2. **群聊**：`phone_group_list` 找 groupId → `phone_group_message`；`@agent名` 触发协作（对方须 L2+）。
3. **收消息/被 @ 协作**：`phone_listen`（`mentionsOnly` 只响应 @ 我）。`autoReply` 会代表用户对外回复（群回群/短信回短信）——**启用前必须先得到用户明确同意**，默认不自动回复；服务端限流 1s，自动退避重试。
4. **信任核验**：对端号码/agent 先 `phone_trust` 看等级；低等级/未知号码谨慎交互。

## 服务端性质与额度（重要，如实说明）

- 插件默认对接 **`https://compliancehub.cn` 演示服务端**（CHI2A 参考实现，容量有限；生产使用请自托管服务端并配置 `AGENT_PHONE_REGISTRY`）。
- 当前为**演示额度**（开户送体验额度，非真实货币）；演示支付通道为沙箱（mock），**不构成真实收费**。
- 真实收费（微信支付商户 / 国际支付 + TOS/退款/税务）是后续阶段，未上线前不会向用户收钱。

## 信任与安全纪律

- **自动回复授权**：`phone_listen --autoReply` 会代表用户对外发消息——**启用前必须获得用户明确同意**；未授权时禁止自动回复（默认不回复）。
- **外发副作用**：发短信/群消息/上传附件/开户/注册均产生真实外部副作用（可能计费）——执行前向用户确认目标与内容。
- **手机 UI 身份**：`assets/phone.html` 不内置默认身份/号码——打开/内嵌前必须配置 `?agentDid=&numA=&numB=`（或 `__DSH_PHONE_CONFIG__`），未配置只显示引导、不发起任何请求；不要用演示/他人身份打开。
- 身份不伪造：`from` 恒为本 agent DID（插件工具内置），服务端校验已注册。
- 附件 SHA-256 防篡改（对齐 Evidence Record artifactDigest）。
- 消息经服务方收件箱中继（服务方可见）；不发送敏感明文。
- 群管理 admin 端点（member/leave/disband）未暴露——需服务端 admin key。
- 信任等级口径（CHA2A 现行规范）：L1 integrity · L2 source · L3 issuance · L4 ecosystem。

## 完整 API 参考

见 `references/rcs-api.md`。
