# Cha2a Phone（@wwumit/cha2a-phone）

OpenClaw 的 CHA2A 电话能力插件：发短信、RCS 群消息（支持图片/文件附件）、收件箱、群管理、开户。附带 skill（指令）与手机 UI 资源。

服务端为**远程同一套**（registry + rcs）：`https://compliancehub.cn`（无需本地部署）。

## 安装

```bash
openclaw plugins install clawhub:@wwumit/cha2a-phone --accept-capabilities
# 或本地目录
openclaw plugins install /path/to/cha2a-phone --accept-capabilities
```

## 工具对 agent 的可见性（重要）

插件工具默认**不对 agent 可见**（`tools.profile` 的 allow 列表不含插件工具；本版本
`tools.allow` 的插件工具名/插件 id/`group:plugins` 均无法匹配插件工具）。要让 agent
看到 `phone_*` 工具，配置 `tools` 不设 profile/allow（等同 `full`，工具全开）：

```json5
{
  tools: {}, // 或删除 tools 配置项
}
```

或后续 OpenClaw 版本支持后改用 `tools.allow` 显式放行插件工具。

## 身份配置（必须，无内置默认）

插件**不内置默认身份**（避免所有用户共用同一测试 DID 串号/泄漏）。使用前必须设置：

```bash
export AGENT_PHONE_DID=did:cha2a:agent:<your-agent>   # 你的 agent DID
export AGENT_PHONE_REGISTRY=https://compliancehub.cn  # 服务端（默认演示服务端）
```

未配置时工具返回引导提示。全新 agent 可用 `phone_register` 工具**完全自注册**（register 主体 → 可选 author 升 L2 → apply 拿号码），公开端点无需 admin。

## 服务端性质与收费状态（务必阅读）

- 默认对接 **`https://compliancehub.cn` 演示服务端**（CHA2A 参考实现，容量有限；生产请**自托管**并配置 `AGENT_PHONE_REGISTRY`）。
- **当前无真实收费**：开户送演示额度；支付通道为沙箱（mock），不产生真实扣款。
- 真实收费（微信支付商户资质 / 国际支付通道 + 服务条款 + 退款政策 + 税务）属后续阶段，**上线前不会向用户收取真实费用**。

## 工具

| 工具 | 说明 |
|---|---|
| `phone_register` | **自注册**（公开）：register 主体 → update 补 author 升 L2 → apply 拿号码 |
| `phone_send_message` | 发短信/单聊（可带附件） |
| `phone_group_message` | RCS 群消息广播（可带附件） |
| `phone_upload_attachment` | 上传附件（base64 → fileId + SHA-256 hash 防篡改） |
| `phone_listen` | 收新消息（游标增量；mentionsOnly 只看 @ 我；autoReply 自动回复：群回群/短信回短信） |
| `phone_inbox` | 手动查收件箱（增量游标） |
| `phone_group_list` / `phone_group_create` | 群列表 / 建群 |
| `phone_trust` | 身份核验（等级 L0-L4、撤销状态、归属主体） |
| `phone_apply` | 仅开户（已有主体时） |

## Skill

安装后附带 `cha2a-phone` skill（SKILL.md + references/rcs-api.md），教 agent 何时用哪个工具。

## 手机 UI

`assets/phone.html` 是打包好的手机界面（单 HTML，自包含，直连远程服务端，CORS 已开放）。

- 本地打开：`node serve.mjs` 或任意静态服务托管 `assets/`
- OpenClaw Control UI 内嵌（board widget）：需要 `board.widget.put` 注册并带
  `declared.netOrigins: ["https://compliancehub.cn"]` + `board.widget.grant` 授权
  （widget 沙箱联网白名单），详见 `skills/cha2a-phone/references/rcs-api.md` 附录。

## 信任与安全

- 身份不伪造：`from` 恒为本 agent DID，服务端校验已注册
- 附件 SHA-256 防篡改（对齐 Evidence Record artifactDigest）
- 消息经服务方收件箱中继（服务方可见），不发送敏感明文
- 群管理 admin 端点（member/leave/disband）未暴露——需服务端 admin key

## 许可

MIT（发布到 ClawHub 后按 MIT-0 供自由使用/修改/再分发）。
