import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'route-lens',
  component: 'Pane',
  requestId: 'route-lens',
  props: {
    title: '路由',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('zh: skills, agents, memory and blocks of one instruction reach the pane', { options: { language: 'zh' } }, async ($, on) => {
  on('command.register', () => ({ value: { command: 'route' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => e)
  on('tool.call', (_, e) =>
    e.tool === 'Write'
      ? { deny: 'PreToolUse:Write hook error: [~/.claude/hooks/check-output-path.sh]: use the output folder' }
      : { result: {} },
  )

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'plan the next post', origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'Skill', skill: 'planner' })
  await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'y', subagent_type: 'Explore', model: 'sonnet' })
  await $.tool.call({ tool: 'Read', file_path: '/Users/x/.claude/memory/feedback_no_guessing.md' })
  await $.tool.call({ tool: 'Bash', command: 'cat /Users/x/.claude/skills/planner/references/checklist.md' })
  await $.tool.call({ tool: 'Write', file_path: '/tmp/a.md', content: 'z' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /plan the next post/ }))?.text).toBe('▶ plan the next post')
  expect((await ui.find({ type: 'Text', text: /^planner$/ }))?.text).toBe('planner')
  expect((await ui.find({ type: 'Text', text: /Explore\(sonnet\)/ }))?.text).toBe('Explore(sonnet)')
  expect((await ui.find({ type: 'Text', text: /feedback_no_guessing/ }))?.text).toBe('实读 feedback_no_guessing.md')
  expect((await ui.find({ type: 'Text', text: /checklist/ }))?.text).toBe('planner/checklist.md')
  expect((await ui.find({ type: 'Text', text: /✗/ }))?.text).toBe('✗ check-output-path.sh')
  await ui.unmount()
})

test('zh: warns when nothing in the setup was used', { options: { language: 'zh' } }, async ($, on) => {
  on('command.register', () => ({ value: { command: 'route' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => e)
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'quick script fix', origin: { kind: 'composer' } })
  for (const command of ['ls', 'pwd', 'echo hi']) await $.tool.call({ tool: 'Bash', command })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /⚠️/ }))?.text).toBe('⚠️ 3 次工具，没用上任何 skill / 记忆 / 规则')
  await ui.unmount()
})

test('zh: background notices join the running row; denied calls and echoed paths are not hits', { options: { language: 'zh' } }, async ($, on) => {
  on('command.register', () => ({ value: { command: 'route' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => e)
  on('tool.call', (_, e) =>
    e.tool === 'Agent' ? { deny: 'PreToolUse:Agent hook error: [~/.claude/hooks/block-risky-commands.sh]: missing acceptance criteria' } : { result: {} },
  )

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'review the draft', origin: { kind: 'composer' } })
  await $.prompt.submit({ text: '<task-notification>done</task-notification>', origin: { kind: 'task-notification' } })
  await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'y', subagent_type: 'Explore', model: 'sonnet' })
  await $.tool.call({ tool: 'Bash', command: 'echo /Users/x/.claude/memory/feedback_a.md >> log' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /review the draft/ }))?.text).toBe('▶ review the draft')
  expect(await ui.find({ type: 'Text', text: /task-notification/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Explore\(sonnet\)/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /✗/ }))?.text).toBe('✗ block-risky-commands.sh')
  expect(await ui.find({ type: 'Text', text: /feedback_a/ })).toBeUndefined()
  await ui.unmount()
})

test('zh: writes a coloured row for the status line script', { options: { language: 'zh' } }, async ($, on) => {
  const writes: string[] = []
  on('command.register', () => ({ value: { command: 'route' } }))
  on('ui.status', () => ({ value: undefined }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('fs.write', (_, e) => {
    writes.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => e)
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'plan the next post', origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'Skill', skill: 'planner' })

  const last = writes[writes.length - 1] ?? ''
  expect(last).toContain('/home/u/.claude/route-lens/sid-1.txt')
  expect(last).toContain('🧩 planner')
  expect(last).toContain('\\u001b[92m')
})

test('zh: reading memory alone is fine; warns only when nothing was used', { options: { language: 'zh' } }, async ($, on) => {
  const writes: string[] = []
  on('command.register', () => ({ value: { command: 'route' } }))
  on('ui.status', () => ({ value: undefined }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.id', () => ({ value: 'sid-2' }))
  on('fs.write', (_, e) => {
    writes.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => e)
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'edit the copy', origin: { kind: 'composer' } })
  for (const command of ['ls', 'pwd']) await $.tool.call({ tool: 'Bash', command })
  await $.tool.call({ tool: 'Read', file_path: '/Users/x/.claude/memory/feedback_a.md' })
  const knowledgeOnly = writes[writes.length - 1] ?? ''
  expect(knowledgeOnly).toContain('🧠 记忆 读 1')
  expect(knowledgeOnly).not.toContain('⚠️')

  await $.prompt.submit({ text: 'one more edit', origin: { kind: 'composer' } })
  for (const command of ['ls', 'pwd', 'echo hi']) await $.tool.call({ tool: 'Bash', command })
  expect(writes[writes.length - 1] ?? '').toContain('没用上任何 skill / 记忆 / 规则')
})

test('defaults to English', async ($, on) => {
  const writes: string[] = []
  on('command.register', () => ({ value: { command: 'route' } }))
  on('ui.status', () => ({ value: undefined }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.id', () => ({ value: 'sid-en' }))
  on('fs.write', (_, e) => {
    writes.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => e)
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'plan the next episode', origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'Read', file_path: '/home/u/.claude/projects/-home-u-app/memory/feedback_x.md' })
  for (const command of ['ls', 'pwd', 'echo hi']) await $.tool.call({ tool: 'Bash', command })
  const last = writes[writes.length - 1] ?? ''
  expect(last).toContain('🧭 Route')
  expect(last).toContain('🧠 memory read 1')
  expect(last).not.toContain('⚠️')
})

test('a hook note on a tool call counts as a nudge', async ($, on) => {
  const writes: string[] = []
  on('command.register', () => ({ value: { command: 'route' } }))
  on('ui.status', () => ({ value: undefined }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.id', () => ({ value: 'sid-h' }))
  on('fs.write', (_, e) => {
    writes.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => e)
  on('classic.PostToolUse', () => ({ additionalContext: ['[~/.claude/hooks/hint-shell.sh]: quote the separator'] }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'tidy the scripts', origin: { kind: 'composer' } })
  await $.classic.PostToolUse({ tool_name: 'Bash', tool_input: { command: 'echo' }, tool_response: {}, tool_use_id: 'u1' } as never)
  expect(writes[writes.length - 1] ?? '').toContain('🛡 1 hook nudge')
})
