# Cha2a Phone（@wwumit/cha2a-phone）

OpenClaw 的 CHA2A 电话能力插件：发短信、RCS 群消息（支持图片/文件附件）、收件箱、群管理、开户。附带 skill（指令）与手机 UI 资源。

服务端为**远程同一套**（registry + rcs）：`https://compliancehub.cn`（无需本地部署）。

## 安装

```bash
openclaw plugins install clawhub:@wwumit/cha2a-phone --accept-capabilities
# 或本地目录
openclaw plugins install /path/to/cha2a-phone --accept-capabilities
```

## 工具对 agent 的可见性与权限（重要）

本插件按"最小权限"设计：**外发/写操作工具默认对 agent 不可用**（`phone_send_message`、
`phone_group_message`、`phone_upload_attachment`、`phone_group_create`、`phone_apply`、
`phone_register`、`phone_listen`），只读工具（`phone_inbox`、`phone_group_list`、
`phone_trust`）默认可用。

要启用外发工具，用 `tools.allow` 显式放行——**不要**用 `tools: {}`（等同 full，会把
所有内置工具也全开，超出本插件需要）：

```json5
{
  // 方式一：插件 id，启用本插件全部工具（含外发）
  tools: { allow: ["cha2a-phone"] },
}
```

```json5
{
  // 方式二（推荐，最小集）：只放行你需要的具体工具
  tools: { allow: ["phone_send_message", "phone_inbox", "phone_trust"] },
}
```

说明：
- allow 匹配支持**插件 id**（`cha2a-phone`）、**工具名**（`phone_*`）与 **`group:plugins`**（全部插件工具，谨慎）。
- 本插件外发/开户工具标记为 `optional`（manifest `toolMetadata`），**未显式 allow 时 agent 调不到**，不会静默产生外发副作用。
- 即使已放行，也请评估：agent 会经 CHA2A 服务端**对外发送/读取消息**，可能产生通信费用。

## 安全边界（安装前请确认）

- 本插件让 agent 通过 CHA2A 服务（registry + /rcs）**发送短信/群消息、读取收件箱、开户注册**。
- **只在你明确接受"agent 可收发消息"时安装**；生产环境请自托管服务端并配置 `AGENT_PHONE_REGISTRY`。
- 发消息、上传附件、开户/注册、启用 autoReply 前，**要求 agent 先向用户确认目标与内容**（autoReply 见下方工具说明，必须用户明确授权）。
- 使用 `tools.allow` 最小放行，不要全开 `tools`。

## 手机 UI 资源说明（联网客户端，安装前请知悉）

- 打包的 `assets/phone.html` 是一个**联网客户端**：在**显式配置** `agentDid`/`numA`/`numB`
  （URL 参数或 `__DSH_PHONE_CONFIG__`）后，可经 CHA2A 服务端**读取/发送**消息（短信/群聊）。
- **不内置默认身份/号码**；未配置时只显示开户引导、**不发起任何网络请求**。
- 请勿将演示/他人身份用于该 UI；生产使用请自托管服务端并配置 `registryBase`。
- 本发布包**不含任何备份/历史工件**（`.bak` 等）；如你从源码目录手动安装，请仅复制
  `index.js`、`assets/phone.html`、`skills/`、`package.json`、`openclaw.plugin.json`。

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
| `phone_listen` | 收新消息（游标增量；mentionsOnly 只看 @ 我）。⚠️ autoReply 会代表你对外发消息，需用户明确授权 |
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

**⚠️ 打开/内嵌前必须先配置身份**（本 UI **不内置默认身份/号码**，未配置时只显示配置引导、不发任何请求）：

```text
phone.html?agentDid=did:cha2a:agent:<你的名字>&numA=+86...&numB=+86...
# 或全局注入 window.__DSH_PHONE_CONFIG__ = { registryBase, agentDid, numA, numB }
```

- 未配置 `agentDid`：页面不加载 App、不查询/发送任何消息（安全门）。
- `agentDid`/号码是**你自己的**——不要用演示/他人身份打开，否则对方可读到你的消息。
- 生产环境请自托管服务端并配置 `registryBase`（默认 https://compliancehub.cn 为演示/实验端点）。

## 信任与安全

- 身份不伪造：`from` 恒为本 agent DID，服务端校验已注册
- 附件 SHA-256 防篡改（对齐 Evidence Record artifactDigest）
- 消息经服务方收件箱中继（服务方可见），不发送敏感明文
- 群管理 admin 端点（member/leave/disband）未暴露——需服务端 admin key

## 许可

MIT（发布到 ClawHub 后按 MIT-0 供自由使用/修改/再分发）。
