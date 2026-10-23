import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hit, HitKind, Turn } from '../types'

type Engine = EngineInterface

// route-lens: shows, for each instruction you type, which route Claude took through your setup:
// skills and agents it used, memory / skill references / rules it read, memory your hooks suggested
// but it never opened, and which hook blocked it. It only watches: every hook that wraps `next`
// returns what `next` returned, untouched.

const PANE = 'route-lens'
const MAX_TURNS = 30
const turns = atom({ plugin: 'route-lens', key: 'turns' } as const, [])

// ---------- language ----------

const TEXT = {
  en: {
    title: 'Route',
    waiting: 'waiting for your first instruction',
    noTools: 'answered directly, no tools',
    direct: (n: number) => `handled directly (${n} tool calls)`,
    offRoute: (n: number) => `⚠️ ${n} tool calls, no skill / memory / rule used`,
    unread: (n: number) => `⚠️ ${n} memory suggested, none read`,
    memory: (read: number, recall: number) => `🧠 memory read ${read}${recall ? ` / suggested ${recall}` : ''}`,
    nudges: (n: number) => `🛡 ${n} hook ${n === 1 ? 'nudge' : 'nudges'}`,
    refs: (n: number) => `refs ${n}`,
    rules: (n: number) => `rules ${n}`,
    defaultModel: 'default',
    script: 'script',
    sessionStart: '(session start)',
    commandDesc: 'Open route details (what each instruction in this session hit)',
    commandDone: 'Route details opened (the expanded form of the status row).',
    empty: 'No instruction yet. Send one.',
    rows: { memory: 'memory', recall: 'hinted', refs: 'refs', blocks: 'blocked', tools: 'tools' },
    readPrefix: 'read',
    sub: '·sub',
    toolCount: (n: number, sub: number) => `${n}${sub ? ` · in subagents ${sub}` : ''}`,
    older: (s: number, a: number, m: number) => `skill ${s} · agent ${a} · memory ${m}`,
    where: { prompt: 'prompt', after: 'after', stop: 'stop' },
  },
  zh: {
    title: '路由',
    waiting: '等第一条指令',
    noTools: '直接回答，没调工具',
    direct: (n: number) => `直接处理（${n} 次工具）`,
    offRoute: (n: number) => `⚠️ ${n} 次工具，没用上任何 skill / 记忆 / 规则`,
    unread: (n: number) => `⚠️ 提示了 ${n} 份记忆，一份没读`,
    memory: (read: number, recall: number) => `🧠 记忆 读 ${read}${recall ? ` / 提示 ${recall}` : ''}`,
    nudges: (n: number) => `🛡 hook 提醒 ${n} 次`,
    refs: (n: number) => `参考 ${n}`,
    rules: (n: number) => `规则 ${n}`,
    defaultModel: '默认',
    script: '脚本',
    sessionStart: '（会话开始）',
    commandDesc: '打开路由详情（本会话每条指令命中了什么）',
    commandDone: '路由详情已打开（状态栏那行的展开版）。',
    empty: '还没有指令。发一条试试。',
    rows: { memory: '记忆', recall: '提示', refs: '参考', blocks: '拦截', tools: '工具' },
    readPrefix: '实读',
    sub: '·子',
    toolCount: (n: number, sub: number) => `${n} 次${sub ? ` · 子代理 ${sub} 次` : ''}`,
    older: (s: number, a: number, m: number) => `skill ${s} · agent ${a} · 记忆 ${m}`,
    where: { prompt: '提交', after: '用后', stop: '收尾' },
  },
}

let t = TEXT.en

// ---------- what counts as a hit ----------

// One user instruction, from its submission to the end of its turn. Only what a person typed (terminal or
// Remote Control) and outside a running turn opens a new row; background notifications, queued messages
// and /loop wake-ups land in the current row.
let isOpen = false
const blockedIds = new Set<string>()

// .md files under a .claude folder's memory / skills / rules, anywhere below it
// (~/.claude/memory, ~/.claude/projects/<p>/memory, ~/.claude/plugins/.../skills, <repo>/.claude/skills ...)
const MD_PATH = /[~\w./@-]*\.claude\/(?:[\w.@-]+\/)*?(?:memory|skills|rules)\/[^\s'"`|;)*>]+\.md/g
const READ_CMD = /(^|[\s;&|(])(cat|sed|head|tail|less|awk|bat)\s/

function classify(path: string): { kind: HitKind; label: string } | undefined {
  if (!/\.claude\//.test(path) || !path.endsWith('.md')) return undefined
  const name = path.split('/').pop() ?? path
  if (/\.claude\/(?:.*\/)?memory\//.test(path)) return name === 'MEMORY.md' ? undefined : { kind: 'memory', label: name }
  if (/\.claude\/(?:.*\/)?rules\//.test(path)) return { kind: 'rule', label: name }
  const skill = path.match(/\/skills\/([^/]+)\//)?.[1]
  if (!skill) return undefined
  if (/\/references\//.test(path)) return { kind: 'ref', label: `${skill}/${name}` }
  if (name === 'SKILL.md') return { kind: 'ref', label: `${skill}/SKILL.md` }
  return undefined
}

function hookName(reason: string): string {
  const m = reason.match(/hooks\/[\w./-]*?([\w.-]+\.(?:sh|py|js|ts))/)
  if (m?.[1]) return m[1]
  return reason.replace(/\s+/g, ' ').slice(0, 24)
}

function shortText(text: string, n: number): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n)}…` : one
}

// ---------- the one-line summary ----------

type Segment = { text: string; color?: string }

// Hits come in layers: flow (skill / agent) > knowledge (memory actually read, skill references, rules and
// nested CLAUDE.md loaded on demand). The root CLAUDE.md / AGENTS.md / MEMORY.md sit in every turn, so they
// never count. Memory a hook suggested but nobody opened gets its own warning.
function segments(turn: Turn | undefined): Segment[] {
  if (!turn) return [{ text: t.waiting, color: 'gray' }]
  const of = (kind: HitKind) => turn.hits.filter(h => h.kind === kind)
  const skills = of('skill').map(h => h.label)
  const agents = of('agent')
  const blocks = of('block')
  const read = of('memory').length
  const recall = of('recall').length
  const refs = of('ref').length
  const rules = of('rule').length
  const nudges = of('nudge').length

  const out: Segment[] = []
  const hasFlow = skills.length > 0 || agents.length > 0
  const hasKnowledge = read > 0 || refs > 0 || rules > 0
  if (turn.tools > 2 && !hasFlow && !hasKnowledge) out.push({ text: t.offRoute(turn.tools), color: 'yellow' })
  if (recall > 0 && read === 0) out.push({ text: t.unread(recall), color: 'yellow' })
  if (skills.length) out.push({ text: `🧩 ${skills.slice(0, 3).join(' ')}${skills.length > 3 ? ` +${skills.length - 3}` : ''}`, color: 'green' })
  if (agents.length) {
    const byType = new Map<string, number>()
    for (const a of agents) {
      const key = `${a.label}·${a.detail ?? t.defaultModel}`
      byType.set(key, (byType.get(key) ?? 0) + 1)
    }
    out.push({ text: `🤖 ${[...byType].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(' ')}`, color: 'cyan' })
  }
  if (read) out.push({ text: t.memory(read, recall), color: 'magenta' })
  if (refs || rules) out.push({ text: `📚 ${[refs ? t.refs(refs) : '', rules ? t.rules(rules) : ''].filter(Boolean).join(' · ')}`, color: 'blue' })
  if (nudges) out.push({ text: t.nudges(nudges), color: 'white' })
  if (blocks.length) out.push({ text: `⛔ ${blocks[blocks.length - 1]?.label ?? ''}${blocks.length > 1 ? ` ×${blocks.length}` : ''}`, color: 'red' })
  if (out.length === 0) out.push({ text: turn.tools ? t.direct(turn.tools) : t.noTools, color: 'gray' })
  return out
}

// The row a statusLine script prints: ~/.claude/route-lens/<session id>.txt, ANSI-coloured, printed as is.
const ANSI: Record<string, string> = { green: '92', cyan: '96', magenta: '95', blue: '94', red: '91', yellow: '93', gray: '90', white: '97' }
let lineFile: string | undefined

function ansiLine(turn: Turn | undefined): string {
  const body = segments(turn)
    .map(seg => `\u001b[${ANSI[seg.color ?? 'gray'] ?? '37'}m${seg.text}\u001b[0m`)
    .join('\u001b[37m │ \u001b[0m')
  return `\u001b[1;94m🧭 ${t.title}\u001b[0m\u001b[37m │ \u001b[0m${body}`
}

async function writeLine($: Engine, list: Turn[]) {
  if (!lineFile) return
  await $.fs.write(lineFile, `${ansiLine(list[list.length - 1])}\n`)
}

// Notes a PreToolUse / PostToolUse hook added for one tool call. UserPromptSubmit notes are left out:
// they ride along on every prompt, like the root CLAUDE.md.
function nudgeHits(tool: string, notes: readonly string[] | undefined): Hit[] {
  return (notes ?? []).filter(n => n.trim() !== '').map(n => ({ kind: 'nudge' as const, label: hookName(n), detail: `${tool} · ${shortText(n, 60)}` }))
}

function isRouteCommand(text: string): boolean {
  return /^\s*\/route\b/.test(text)
}

async function openTurn($: Engine, prompt: string) {
  isOpen = true
  const turn: Turn = { id: `t${Date.now()}`, prompt: shortText(prompt, 48), at: Date.now(), hits: [], tools: 0, subTools: 0 }
  await writeLine($, await update($, turns, list => [...list, turn].slice(-MAX_TURNS)))
}

// One write: merge hits into the current row (deduplicated), optionally counting one tool call.
async function record($: Engine, hits: Hit[], tool?: { isSub: boolean }) {
  if (hits.length === 0 && !tool) return
  const after = await update($, turns, list => {
    const last = list[list.length - 1] ?? { id: 't0', prompt: t.sessionStart, at: Date.now(), hits: [], tools: 0, subTools: 0 }
    const merged = [...last.hits]
    for (const hit of hits) {
      const isDup = hit.kind !== 'agent' && hit.kind !== 'block' &&
        merged.some(h => h.kind === hit.kind && h.label === hit.label && !!h.isSub === !!hit.isSub)
      if (!isDup) merged.push(hit)
    }
    const next: Turn = {
      ...last,
      hits: merged,
      tools: last.tools + (tool && !tool.isSub ? 1 : 0),
      subTools: last.subTools + (tool && tool.isSub ? 1 : 0),
    }
    return list.length === 0 ? [next] : [...list.slice(0, -1), next]
  })
  await writeLine($, after)
}

export const register: Register = (on, options) => {
  t = options.language === 'zh' ? TEXT.zh : TEXT.en

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'route', description: t.commandDesc })
      $.ui.status(undefined)
      const home = await $.env.get('HOME')
      if (home) lineFile = `${home}/.claude/route-lens/${await $.session.id()}.txt`
      await writeLine($, await read($, turns))
      // The status row is the default view; a details pane left open closes on load. /route opens it again.
      $.ui.close({ id: PANE }).catch(() => undefined)
    } catch {}
    return next(e)
  })

  on('command.run', { command: 'route' }, async $ => {
    await $.ui.open({ id: PANE, title: t.title })
    return { text: t.commandDone }
  })

  on('prompt.submit', async ($, e, next) => {
    try {
      const isUser = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
      if (isUser && !e.isMeta && e.turnId === undefined && !isRouteCommand(e.text)) await openTurn($, e.text)
    } catch {}
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!(e as { agentId?: string }).agentId) isOpen = false
    return r
  })

  // Memory a UserPromptSubmit hook suggested (paths to memory .md files in its additionalContext), and blocked prompts.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const r = await next(e)
    try {
      const isUser = e.source === undefined || e.source === 'user'
      if (!isOpen && isUser && !isRouteCommand(e.prompt)) await openTurn($, e.prompt)
      const hits: Hit[] = []
      for (const text of r.additionalContext ?? []) {
        for (const path of text.match(MD_PATH) ?? []) {
          const c = classify(path)
          if (c?.kind === 'memory') hits.push({ kind: 'recall', label: c.label })
        }
      }
      if (r.block) hits.push({ kind: 'block', label: hookName(r.block), detail: `${t.where.prompt} · ${shortText(r.block, 60)}` })
      await record($, hits)
    } catch {}
    return r
  }).catch(($, e, next) => next(e))

  on('classic.PreToolUse', async ($, e, next) => {
    const r = await next(e)
    try {
      const reason = r.deny ?? r.ask
      if (reason) {
        if (e.tool_use_id) blockedIds.add(e.tool_use_id)
        await record($, [{ kind: 'block', label: hookName(reason), detail: `${e.tool} · ${shortText(reason, 60)}` }])
      } else {
        // A hook that let the call through but added a note for the model: it steered, so count it
        await record($, nudgeHits(e.tool, r.additionalContext))
      }
    } catch {}
    return r
  }).catch(($, e, next) => next(e))

  on('classic.PostToolUse', async ($, e, next) => {
    const r = await next(e)
    try {
      if (r.block) await record($, [{ kind: 'block', label: hookName(r.block), detail: `${t.where.after} · ${shortText(r.block, 60)}` }])
      else await record($, nudgeHits(e.tool_name, r.additionalContext))
    } catch {}
    return r
  }).catch(($, e, next) => next(e))

  // Instruction files loaded on demand: a nested CLAUDE.md / AGENTS.md, rules injected by a path match.
  // Files loaded at session start don't count.
  on('classic.InstructionsLoaded', async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.load_reason === 'nested_traversal' || e.load_reason === 'path_glob_match') {
        const parts = e.file_path.split('/')
        const name = parts.pop() ?? e.file_path
        const label = /^(CLAUDE|AGENTS)(\.local)?\.md$/.test(name) ? `${parts.pop() ?? ''}/${name}` : name
        await record($, [{ kind: 'rule', label }])
      }
    } catch {}
    return r
  }).catch(($, e, next) => next(e))

  on('classic.Stop', async ($, e, next) => {
    const r = await next(e)
    try {
      if (r.block) await record($, [{ kind: 'block', label: hookName(r.block), detail: `${t.where.stop} · ${shortText(r.block, 60)}` }])
    } catch {}
    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    try {
      const isSub = !!e.agentId
      const hits: Hit[] = []
      const wasBlocked = !!e.tool_use_id && blockedIds.has(e.tool_use_id)
      if (wasBlocked && e.tool_use_id) blockedIds.delete(e.tool_use_id)
      if (r.deny !== undefined) {
        // A plugin's refusal (a settings hook's refusal was already recorded at classic.PreToolUse)
        if (!wasBlocked) hits.push({ kind: 'block', label: hookName(r.deny), detail: `${e.tool} · ${shortText(r.deny, 60)}`, isSub })
      } else if (!r.isError && !wasBlocked) {
        // Only calls that actually ran count
        if (e.tool === 'Skill') {
          hits.push({ kind: 'skill', label: e.skill, isSub })
        } else if (e.tool === 'Agent') {
          hits.push({ kind: 'agent', label: e.subagent_type ?? 'general-purpose', detail: e.model ?? t.defaultModel, isSub })
        } else if (e.tool === 'Workflow') {
          hits.push({ kind: 'agent', label: 'workflow', detail: e.name ?? t.script, isSub })
        } else if (e.tool === 'Read') {
          const c = classify(e.file_path)
          if (c) hits.push({ ...c, isSub })
        } else if (e.tool === 'Bash' && READ_CMD.test(e.command)) {
          for (const path of e.command.match(MD_PATH) ?? []) {
            const c = classify(path)
            if (c) hits.push({ ...c, isSub })
          }
        }
      }
      await record($, hits, { isSub })
    } catch {}
    return r
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, turns)
    const cur = list[list.length - 1]
    if (!cur) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{t.empty}</Text>
        </Box>
      )
    }
    const pick = (kind: HitKind) => cur.hits.filter(h => h.kind === kind)
    const names = (hits: Hit[]) => hits.map(h => (h.isSub ? `${h.label}${t.sub}` : h.label)).join('  ')
    const agents = pick('agent').map(h => `${h.label}(${h.detail})${h.isSub ? t.sub : ''}`).join('  ')
    const skills = pick('skill')
    const blocks = pick('block')
    const refs = [...pick('ref'), ...pick('rule')]
    const older = list.slice(0, -1).reverse().slice(0, Math.max(0, (e.viewport?.rows ?? 24) - 16))

    const row = (tag: string, body: string, color?: string) => (
      <Box flexDirection="row">
        <Text dimColor>{tag.padEnd(8, ' ')}</Text>
        <Text color={color}>{body}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Text bold>▶ {cur.prompt}</Text>
        {row('skill', skills.length ? names(skills) : '—', skills.length ? 'green' : undefined)}
        {row('agent', agents || '—', agents ? 'cyan' : undefined)}
        {row(t.rows.memory, pick('memory').length ? `${t.readPrefix} ${names(pick('memory'))}` : '—')}
        {row(t.rows.recall, pick('recall').length ? names(pick('recall')) : '—')}
        {row(t.rows.refs, refs.length ? names(refs) : '—')}
        {row('hooks', pick('nudge').length ? pick('nudge').map(h => h.label).join('  ') : '—')}
        {row(t.rows.blocks, blocks.length ? blocks.map(b => `✗ ${b.label}`).join('  ') : '—', blocks.length ? 'red' : undefined)}
        {blocks.slice(-3).map(b => (
          <Text dimColor>{'        '}{b.detail}</Text>
        ))}
        {row(t.rows.tools, t.toolCount(cur.tools, cur.subTools))}
        {segments(cur).filter(seg => seg.color === 'yellow').map(seg => (
          <Text color="yellow">{seg.text}</Text>
        ))}
        {older.length > 0 && <Text dimColor>────────</Text>}
        {older.map(turn => {
          const s = turn.hits.filter(h => h.kind === 'skill').length
          const a = turn.hits.filter(h => h.kind === 'agent').length
          const m = turn.hits.filter(h => h.kind === 'memory' || h.kind === 'recall').length
          const b = turn.hits.filter(h => h.kind === 'block').length
          return (
            <Text dimColor>
              {shortText(turn.prompt, 18)}  {t.older(s, a, m)}{b ? ` · ✗${b}` : ''}
            </Text>
          )
        })}
      </Box>
    )
  })
}
