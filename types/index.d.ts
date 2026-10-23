export type HitKind = 'skill' | 'agent' | 'memory' | 'recall' | 'ref' | 'rule' | 'block' | 'nudge'

export type Hit = {
  kind: HitKind
  /** skill name / agent type / file name / hook name */
  label: string
  /** an agent's model; where and why a hook blocked or nudged */
  detail?: string
  /** happened inside a subagent */
  isSub?: boolean
}

export type Turn = {
  id: string
  prompt: string
  at: number
  hits: Hit[]
  tools: number
  subTools: number
}

declare module 'claude-code' {
  interface PluginState {
    'route-lens': { turns: Turn[] }
  }
}
