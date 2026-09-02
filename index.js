/**
 * cha2a-phone — OpenClaw 插件（CHA2A 电话能力）
 *
 * 提供结构化 phone_* 工具（发短信/群消息/附件/收件箱/群管理/开户/自注册/收消息/信任核验），
 * 直调远程服务端（registry + /rcs，默认 https://compliancehub.cn——CHA2A 公共注册/认证服务），
 * 附带 skill（指令）与手机 UI 资源（assets/phone.html）。
 *
 * 身份配置（无内置默认，避免串号）：
 *   - 环境变量 AGENT_PHONE_DID（推荐：did:cha2a:agent:<你的短名>）
 *   - 未配置时工具返回明确提示：请先配置 AGENT_PHONE_DID 或先用 phone_register 自注册
 * 端点：AGENT_PHONE_REGISTRY（默认 https://compliancehub.cn）/ AGENT_PHONE_RCS（默认 registry + /rcs）
 */
import { Type } from "typebox"
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry"

// 无内置默认 DID：发布后每个用户必须配置自己的身份，避免共用测试身份串号/泄漏
const DEFAULT_DID = process.env.AGENT_PHONE_DID || ""
const REGISTRY = process.env.AGENT_PHONE_REGISTRY || "https://compliancehub.cn"
const RCS = process.env.AGENT_PHONE_RCS || `${REGISTRY}/rcs`

/** 身份守卫：未配置 AGENT_PHONE_DID 时返回引导错误（不静默落到他人身份） */
function identityError() {
  return result(
    "身份未配置：请设置环境变量 AGENT_PHONE_DID=did:cha2a:agent:<你的短名>（可先用 phone_register 自注册），或配置 AGENT_PHONE_REGISTRY 指向自托管服务端。",
    { ok: false, error: "AGENT_PHONE_DID not configured" }
  )
}

async function jsonFetch(url, init) {
  // P2: 超时 12s（防工具无限挂起）；超时抛错 → 调用方 catch 报错
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal, headers: { "Content-Type": "application/json", Accept: "application/json", ...(init?.headers || {}) } })
    let body = null
    try { body = await r.json() } catch { body = null }
    return { status: r.status, body }
  } finally { clearTimeout(timer) }
}

/** 工具结果统一封装 */
function result(text, details) {
  return { content: [{ type: "text", text }], details }
}

export default definePluginEntry({
  id: "cha2a-phone",
  name: "Cha2a Phone",
  description: "A2A-ready agent phone（CHA2A 体系）：号码簿寻址 + DID 身份 + 信任 L0-L4 + RCS 群聊（图片附件）+ 短信中继 + 自注册。服务端：https://compliancehub.cn",
  register(api) {
    // 1. 发短信 / 单聊（支持附件）
    api.registerTool({
      name: "phone_send_message",
      label: "发短信",
      description: "通过 CHA2A 电话通道发送短信/单聊消息（可带已上传的图片/文件附件）。to 为对端号码（4-15 位，可带 +）。",
      parameters: Type.Object({
        to: Type.String({ description: "对端号码（E.164），如 +8613800138000（示例号码）" }),
        text: Type.Optional(Type.String({ description: "消息文本（与附件二选一或同发）" })),
        attachment: Type.Optional(Type.Object({
          fileId: Type.String(), name: Type.String(), size: Type.Optional(Type.Number()), hash: Type.String(),
        }, { description: "先用 phone_upload_attachment 上传拿 fileId+hash" })),
        fromNumber: Type.Optional(Type.String({ description: "本机号码（默认取 agent 身份配置）" })),
      }),
      outputSchema: Type.Object({ ok: Type.Boolean(), id: Type.Optional(Type.String()), to: Type.Optional(Type.String()), error: Type.Optional(Type.String()) }, { additionalProperties: false }),
      async execute(_id, params) {
        if (!DEFAULT_DID) return identityError()

        try {
          const { status, body } = await jsonFetch(`${RCS}/api/v1/phone/message`, {
            method: "POST",
            body: JSON.stringify({
              from: DEFAULT_DID, fromNumber: params.fromNumber, to: params.to, text: params.text,
              attachment: params.attachment ? { fileId: params.attachment.fileId, name: params.attachment.name, size: params.attachment.size, hash: params.attachment.hash } : undefined,
            }),
          })
          if (status === 200 || status === 201) return result(`已发送 → ${params.to}（${body?.id}）`, { ok: true, id: body?.id, to: body?.to })
          return result(`发送失败: ${body?.error || `HTTP ${status}`}`, { ok: false, error: body?.error || `HTTP ${status}` })
        } catch (e) { return result(`发送异常: ${e.message}`, { ok: false, error: e.message }) }
      },
    })

    // 2. 群消息广播（支持附件）
    api.registerTool({
      name: "phone_group_message",
      label: "群消息",
      description: "向 RCS 群发消息（可带附件）。groupId 用 phone_group_list 获取。",
      parameters: Type.Object({
        groupId: Type.String({ description: "群 id，如 grp_xxxx" }),
        text: Type.Optional(Type.String()),
        attachment: Type.Optional(Type.Object({ fileId: Type.String(), name: Type.String(), size: Type.Optional(Type.Number()), hash: Type.String() })),
      }),
      outputSchema: Type.Object({ ok: Type.Boolean(), groupId: Type.Optional(Type.String()), delivered: Type.Optional(Type.Array(Type.String())), error: Type.Optional(Type.String()) }, { additionalProperties: false }),
      async execute(_id, params) {
        if (!DEFAULT_DID) return identityError()

        try {
          const { status, body } = await jsonFetch(`${RCS}/api/v1/phone/group/message`, {
            method: "POST",
            body: JSON.stringify({ from: DEFAULT_DID, groupId: params.groupId, text: params.text, attachment: params.attachment }),
          })
          if (status === 200 || status === 201) return result(`群消息已广播（投递 ${(body?.delivered || []).length}）`, { ok: true, groupId: params.groupId, delivered: body?.delivered })
          return result(`群消息失败: ${body?.error || `HTTP ${status}`}`, { ok: false, error: body?.error || `HTTP ${status}` })
        } catch (e) { return result(`群消息异常: ${e.message}`, { ok: false, error: e.message }) }
      },
    })

    // 3. 上传附件（base64 → fileId + SHA-256）
    api.registerTool({
      name: "phone_upload_attachment",
      label: "上传附件",
      description: "上传图片/文件附件（base64，≤10MB），返回 fileId + SHA-256 hash；hash 是防篡改标记，发送时原样回传。",
      parameters: Type.Object({
        name: Type.String({ description: "文件名，如 qr.png" }),
        mime: Type.String({ description: "MIME，如 image/png" }),
        dataBase64: Type.String({ description: "文件内容的 base64（不含 data: 前缀）" }),
      }),
      outputSchema: Type.Object({ ok: Type.Boolean(), fileId: Type.Optional(Type.String()), hash: Type.Optional(Type.String()), size: Type.Optional(Type.Number()), error: Type.Optional(Type.String()) }, { additionalProperties: false }),
      async execute(_id, params) {
        if (!DEFAULT_DID) return identityError()

        try {
          const { status, body } = await jsonFetch(`${RCS}/api/v1/phone/attachment`, {
            method: "POST",
            body: JSON.stringify({ did: DEFAULT_DID, name: params.name, mime: params.mime, data: params.dataBase64 }),
          })
          if (status === 201 || (body && body.ok)) return result(`附件已上传: ${body?.fileId}（${body?.size} bytes, sha256 ${(body?.hash || "").slice(0, 16)}…）`, { ok: true, fileId: body?.fileId, hash: body?.hash, size: body?.size })
          return result(`上传失败: ${body?.error || `HTTP ${status}`}`, { ok: false, error: body?.error || `HTTP ${status}` })
        } catch (e) { return result(`上传异常: ${e.message}`, { ok: false, error: e.message }) }
      },
    })

    // 4. 收件箱
    api.registerTool({
      name: "phone_inbox",
      label: "收件箱",
      description: "读取本 agent 的短信/群消息收件箱（增量 since 游标，默认最近消息）。",
      parameters: Type.Object({ since: Type.Optional(Type.Number({ description: "增量游标（消息 seq）" })) }),
      async execute(_id, params) {
        if (!DEFAULT_DID) return identityError()

        try {
          const { status, body } = await jsonFetch(`${RCS}/api/v1/phone/messages?did=${encodeURIComponent(DEFAULT_DID)}&since=${params.since || 0}`)
          if (status >= 400) return result(`收件箱查询失败: ${body?.error || `HTTP ${status}`}`, { ok: false, error: body?.error || `HTTP ${status}` })
          const msgs = body?.messages || []
          const text = msgs.length ? msgs.slice(0, 10).map((m) => `[${m.fromNumber || m.from}] ${(m.text || (m.attachment ? `📎 ${m.attachment.name}` : "")).slice(0, 80)}`).join("\n") : "（无消息）"
          return result(`收件箱 ${msgs.length} 条：\n${text}`, { ok: true, count: msgs.length })
        } catch (e) { return result(`收件箱异常: ${e.message}`, { ok: false, error: e.message }) }
      },
    })

    // 5. 群列表
    api.registerTool({
      name: "phone_group_list",
      label: "群列表",
      description: "列出本 agent 加入的 RCS 群。",
      parameters: Type.Object({}),
      async execute() {
        if (!DEFAULT_DID) return identityError()   // P1-2: 与其余 9 工具一致——未配置时零请求
        try {
          const { status, body } = await jsonFetch(`${RCS}/api/v1/phone/group/list?did=${encodeURIComponent(DEFAULT_DID)}`)
          const groups = body?.groups || []
          const text = groups.length ? groups.map((g) => `${g.groupId}  ${g.name}（${g.memberCount} 成员）`).join("\n") : "（未加入任何群）"
          return result(`群列表 ${groups.length} 个：\n${text}`, { ok: true, count: groups.length })
        } catch (e) { return result(`群列表异常: ${e.message}`, { ok: false, error: e.message }) }
      },
    })

    // 6. 建群
    api.registerTool({
      name: "phone_group_create",
      label: "建群",
      description: "创建 RCS 群（成员需在号码簿，≤100 人；支持号码或 agent DID）。",
      parameters: Type.Object({
        name: Type.String({ description: "群名（≤60 字符）" }),
        members: Type.Array(Type.String({ description: "成员号码或 agent DID" })),
      }),
      async execute(_id, params) {
        if (!DEFAULT_DID) return identityError()

        try {
          const { status, body } = await jsonFetch(`${RCS}/api/v1/phone/group`, {
            method: "POST",
            body: JSON.stringify({ name: params.name, creator: DEFAULT_DID, members: params.members }),
          })
          if (status === 200 || status === 201 || (body && body.ok)) return result(`建群成功: ${body?.groupId}`, { ok: true, groupId: body?.groupId })
          return result(`建群失败: ${body?.error || `HTTP ${status}`}`, { ok: false, error: body?.error || `HTTP ${status}` })
        } catch (e) { return result(`建群异常: ${e.message}`, { ok: false, error: e.message }) }
      },
    })

    // 7. 开户申请（自注册号码）
    api.registerTool({
      name: "phone_apply",
      label: "开户",
      description: "开户申请（公开端点）：为当前 agent DID（短名须 ASCII：字母/数字/._-@/）分配号码并送体验额度。**开户即同意服务条款**——仅当用户明确同意后调用，并以 consent:true 显式确认（P2：不再静默代用户同意）。",
      parameters: Type.Object({
        displayName: Type.Optional(Type.String({ description: "显示名（默认取 DID 短名）" })),
        consent: Type.Optional(Type.Boolean({ description: "是否同意服务条款——**仅当用户明确同意时传 true**；缺省/非 true 不执行开户" })),
      }),
      async execute(_id, params) {
        if (!DEFAULT_DID) return identityError()
        if (params.consent !== true) return result("开户需先获得用户明确同意（服务条款）——确认后以 consent:true 重试", { ok: false, error: "consent required" })

        try {
          const { status, body } = await jsonFetch(`${REGISTRY}/api/v1/phone/apply`, {
            method: "POST",
            body: JSON.stringify({ agentDid: DEFAULT_DID, displayName: params.displayName || DEFAULT_DID.split(":").pop(), consent: true }),
          })
          if (body && body.number) return result(`开户成功: ${body.number}${body.welcomeCredits ? `（送 ${body.welcomeCredits} 体验额度）` : ""}`, { ok: true, number: body.number, welcomeCredits: body.welcomeCredits })
          return result(`开户失败: ${body?.error || `HTTP ${status}`}`, { ok: false, error: body?.error || `HTTP ${status}` })
        } catch (e) { return result(`开户异常: ${e.message}`, { ok: false, error: e.message }) }
      },
    })

    // 8. 自注册（对齐 workbuddy agents add：register → update(author→L2) → apply 号码 → 查等级）
    api.registerTool({
      name: "phone_register",
      label: "自注册",
      description: "agent 完全自己注册（公开端点，无需 admin）：1) register 注册 DID 主体；2) 可选 update 补 metadata.author 升 L2（被 @ 协作的前提）；3) apply 开户分配号码+体验额度。返回 did/号码/信任等级。",
      parameters: Type.Object({
        agentId: Type.String({ description: "agent 短名（did:cha2a:agent:<agentId>）" }),
        displayName: Type.Optional(Type.String({ description: "显示名（默认 agentId）" })),
        author: Type.Optional(Type.String({ description: "归属主体（填了才能升 L2 source）" })),
      }),
      outputSchema: Type.Object({ ok: Type.Boolean(), did: Type.Optional(Type.String()), number: Type.Optional(Type.String()), level: Type.Optional(Type.Number()), levelName: Type.Optional(Type.String()), error: Type.Optional(Type.String()) }, { additionalProperties: false }),
      async execute(_id, params) {
        // 短名必须 ASCII（DID 规范：did:cha2a:<type>:<id> 的 id 只允许 [A-Za-z0-9._\-/@:]）
        if (!/^[A-Za-z0-9._\-/@:]+$/.test(params.agentId)) {
          return result(`agentId 只能包含字母/数字/._-@/：（不允许中文/空格/其他符号），收到「${params.agentId}」`, { ok: false, error: "invalid agent id (ASCII only)" })
        }
        const did = `did:cha2a:agent:${params.agentId}`
        const name = params.displayName || params.agentId
        try {
          // 1. 注册 DID（409 已存在则跳过）
          const r1 = await jsonFetch(`${REGISTRY}/api/v1/register`, {
            method: "POST", body: JSON.stringify({ type: "agent", id: params.agentId, metadata: { name, ...(params.author ? { author: params.author } : {}) } }),
          })
          if (![200, 201, 409].includes(r1.status) && !r1.body?.did) return result(`注册失败: ${r1.body?.error || `HTTP ${r1.status}`}`, { ok: false, error: r1.body?.error || `HTTP ${r1.status}` })
          // 2. 补 author 升 L2
          if (params.author) {
            await jsonFetch(`${REGISTRY}/api/v1/update`, {
              method: "POST", body: JSON.stringify({ type: "agent", id: params.agentId, metadata: { name, author: params.author } }),
            })
          }
          // 3. 号码：lookup 已有则复用，否则 apply
          let number = null
          const lk = await jsonFetch(`${REGISTRY}/api/v1/phone/lookup?did=${encodeURIComponent(did)}`)
          number = (lk.body?.numbers || [])[0] || null
          if (!number) {
            const ap = await jsonFetch(`${REGISTRY}/api/v1/phone/apply`, {
              method: "POST", body: JSON.stringify({ agentDid: did, displayName: name, consent: true }),
            })
            number = ap.body?.number || null
          }
          // 4. 查等级
          const t = await jsonFetch(`${REGISTRY}/api/v1/trust/query?did=${encodeURIComponent(did)}`)
          const level = t.body?.level ?? 0
          return result(`注册完成: ${did}（号码 ${number || "无"}，${t.body?.levelName || `L${level}`}）`, { ok: true, did, number, level, levelName: t.body?.levelName || `L${level}` })
        } catch (e) { return result(`注册异常: ${e.message}`, { ok: false, error: e.message }) }
      },
    })

    // 9. 收消息（对齐 workbuddy listen --once：游标增量 + mentions 过滤 + 自动回复）
    api.registerTool({
      name: "phone_listen",
      label: "收消息",
      description: "检查本 agent 收件箱的新消息（游标增量）。可选：mentionsOnly 只看 @ 我的；autoReply 对每条新消息自动回复（群消息回群、短信回短信，限流退避）。适合 agent 被 @ 协作时响应。",
      parameters: Type.Object({
        since: Type.Optional(Type.Number({ description: "游标（消息 seq）；不传则只取最近 5 条待处理" })),
        mentionsOnly: Type.Optional(Type.Boolean({ description: "只看 @ 提到我的消息（默认 false）" })),
        autoReply: Type.Optional(Type.String({ description: "自动回复模板；特殊值 echo = 回显原文。留空则不回复" })),
        maxMessages: Type.Optional(Type.Number({ description: "本次最多处理条数（默认 5）" })),
      }),
      async execute(_id, params) {
        if (!DEFAULT_DID) return identityError()

        const did = DEFAULT_DID
        const short = did.replace(/^did:cha2a:agent:/, "")
        const max = params.maxMessages || 5
        try {
          const { status, body } = await jsonFetch(`${RCS}/api/v1/phone/messages?did=${encodeURIComponent(did)}&since=${params.since || 0}`)
          if (status !== 200) return result(`收件箱不可用: ${body?.error || `HTTP ${status}`}`, { ok: false, error: body?.error || `HTTP ${status}` })
          const all = (body?.messages || []).filter((m) => m.from !== did && (m.seq || 0) > (params.since || 0)).slice(0, max)
          if (!all.length) return result("（无新消息）", { ok: true, count: 0, nextSince: params.since || 0 })
          let cursor = params.since || 0
          const handled = []
          for (const m of all) {
            cursor = Math.max(cursor, m.seq || 0)
            const text = String(m.text || "")
            if (params.mentionsOnly && !text.includes(`@${short}`) && !text.includes(did)) continue
            // @协作短信投递（payload.source=group）→ 视为群消息，回复回群；普通短信回短信
            const gid = m.groupId || (m.payload && m.payload.source === "group" ? m.payload.groupId : null)
            const entry = { seq: m.seq, tag: gid ? "群" : "短信", from: m.fromNumber || m.from, groupId: gid || null, text: text.slice(0, 200) }
            // 自动回复（群回群 / 短信回短信；服务端限流 1s，退避 + 重试一次）
            if (params.autoReply && text.trim()) {
              const reply = params.autoReply === "echo" ? `[agent回复·${short}] 收到：${text}` : params.autoReply
              await new Promise((r) => setTimeout(r, 1300))
              const attempt = async () => {
                if (gid) {
                  return jsonFetch(`${RCS}/api/v1/phone/group/message`, { method: "POST", body: JSON.stringify({ from: did, groupId: gid, text: reply }) })
                }
                const toNum = String(m.fromNumber || "").replace(/[^0-9+]/g, "")
                if (!toNum) return { status: 400, body: { error: "no from number" } }
                return jsonFetch(`${RCS}/api/v1/phone/message`, { method: "POST", body: JSON.stringify({ from: did, to: toNum, text: reply }) })
              }
              let rp = await attempt()
              if (![200, 201].includes(rp.status)) { await new Promise((r) => setTimeout(r, 1500)); rp = await attempt() }
              entry.replied = [200, 201].includes(rp.status)
            }
            handled.push(entry)
          }
          const lines = handled.map((h) => `[${h.tag}] ${h.from}: ${h.text}${h.replied ? "（已自动回复）" : ""}`).join("\n")
          return result(`新消息 ${handled.length} 条：\n${lines}\n（下次游标 ${cursor}）`, { ok: true, count: handled.length, nextSince: cursor, messages: handled })
        } catch (e) { return result(`收消息异常: ${e.message}`, { ok: false, error: e.message }) }
      },
    })

    // 10. 身份核验（对齐 workbuddy trust：信任等级 + 状态）
    api.registerTool({
      name: "phone_trust",
      label: "身份核验",
      description: "查询 agent/号码的信任等级与状态（L0-L4、是否撤销、归属主体）。发消息/被 @ 协作前可先核验对端。",
      parameters: Type.Object({
        did: Type.Optional(Type.String({ description: "要核验的 DID（默认当前 agent）" })),
        number: Type.Optional(Type.String({ description: "或按号码核验（号码 → DID → 等级）" })),
      }),
      async execute(_id, params) {
        if (!DEFAULT_DID && !params.did && !params.number) return identityError()

        try {
          let did = params.did || DEFAULT_DID
          if (params.number) {
            const r = await jsonFetch(`${REGISTRY}/api/v1/phone/resolve?number=${encodeURIComponent(params.number)}`)
            did = r.body?.agentDid || did
          }
          const { status, body } = await jsonFetch(`${REGISTRY}/api/v1/trust/query?did=${encodeURIComponent(did)}`)
          if (status !== 200 || !body?.registered) return result(`未注册或查询失败: ${did}`, { ok: false, did, error: body?.error || `HTTP ${status}` })
          return result(
            `${did}\n  等级: ${body.levelName || `L${body.level}`}（level ${body.level}）\n  状态: ${body.revoked ? "已撤销" : "active"}\n  归属: ${body.metadata?.author || "（未填 author，非 L2）"}`,
            { ok: true, did, level: body.level, levelName: body.levelName, revoked: body.revoked, author: body.metadata?.author }
          )
        } catch (e) { return result(`核验异常: ${e.message}`, { ok: false, error: e.message }) }
      },
    })
  },
})
