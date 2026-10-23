# route-lens

**English** · [中文](#中文)

A Claude Code mod that shows, for every instruction you type, which route Claude took through your setup.

You've built skills, agents, memory files, rules and hooks so that Claude reuses what you already know. But did this instruction actually use any of it, or did Claude work it out from scratch again? route-lens puts the answer in one row under your status line:

```
🧭 Route │ 🧩 code-review │ 🤖 Explore·sonnet ×2 │ 🧠 memory read 1 / suggested 3 │ 📚 refs 2 · rules 1 │ 🛡 1 hook nudge │ ⛔ block-risky-commands.sh
```

| Mark | Colour | Meaning |
|---|---|---|
| 🧩 | green | skills it ran |
| 🤖 | cyan | agents it spawned, with their model |
| 🧠 | magenta | memory files it actually read / memory your hooks suggested |
| 📚 | blue | skill references read; rules and nested `CLAUDE.md` loaded on demand |
| 🛡 | white | notes a hook added before or after a tool call |
| ⛔ | red | the hook that blocked it |
| ⚠️ | yellow | `N tool calls, no skill / memory / rule used`, or `N memory suggested, none read` |

What doesn't count: the root `CLAUDE.md`, `AGENTS.md` and `MEMORY.md` load on every turn, and so do notes a `UserPromptSubmit` hook adds to every prompt. They'd make every row look like a hit, so route-lens leaves them out.

Type `/route` for the details pane: the files and hooks behind each count, and your earlier instructions one line each.

route-lens only watches. Every hook it adds returns exactly what the engine returned: it never changes, delays or blocks a tool call, a prompt or another hook.

## Install

At the prompt of a Claude Code terminal session (v2.1.287 or later):

```
/plugin install route-lens --marketplace Buer2333/route-lens
```

Answer `y` to add the marketplace, then pick a scope (user scope = every session).

From a shell:

```
claude plugin install route-lens --marketplace Buer2333/route-lens
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `Buer2333/route-lens`, then Add plugin.

## Show the row in your status line

route-lens writes the coloured row to `~/.claude/route-lens/<session id>.txt`. Your status line script prints it. `statusline/route-lens-line.sh` in this repository does that.

**No status line yet?** In `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "sh /path/to/route-lens/statusline/route-lens-line.sh", "refreshInterval": 3 }
```

**Already have one?** Read stdin once at the top of your script, keep your own output, and add a line at the end:

```sh
input=$(cat)
# ... your status line, fed from "$input" ...
printf '%s' "$input" | sh /path/to/route-lens/statusline/route-lens-line.sh
```

Each `echo` / `printf` line of a status line script shows as its own row.

## Language

English by default. For Chinese, open `/plugin`, pick route-lens, and set its `language` option to `zh`. Claude Code stores it under `pluginConfigs` in your settings and reloads the mod.

## Limits

- Paths are matched by convention: `.md` files under a `.claude/` folder's `memory/`, `skills/` and `rules/` (including `~/.claude/projects/*/memory/` and plugin skills). Reads through `cat`, `sed`, `head`, `tail`, `less`, `awk` and `bat` count; a path merely mentioned in another command doesn't.
- "Suggested memory" relies on a `UserPromptSubmit` hook of yours that names memory files in its additional context. Without one, that count stays empty.
- The row files in `~/.claude/route-lens/` are a few hundred bytes each, one per session. Delete them whenever you like.

## Develop

```
claude --plugin-dir /path/to/route-lens
claude plugin validate /path/to/route-lens
claude plugin test /path/to/route-lens
```

MIT licence.

---

## 中文

一个 Claude Code mod：你发的每条指令，到底走了你搭的哪条路。

你写了 skill、agent、memory、rules 和 hook，就是想让 Claude 复用已有的经验。可这一条指令到底用上没有？还是又从头想了一遍？route-lens 在状态栏下面多画一行告诉你：

```
🧭 路由 │ 🧩 code-review │ 🤖 Explore·sonnet ×2 │ 🧠 记忆 读 1 / 提示 3 │ 📚 参考 2 · 规则 1 │ 🛡 hook 提醒 1 次 │ ⛔ block-risky-commands.sh
```

| 标记 | 颜色 | 含义 |
|---|---|---|
| 🧩 | 绿 | 调用了哪些 skill |
| 🤖 | 青 | 派了哪些 agent，各用什么模型 |
| 🧠 | 紫 | 实际读了几份 memory / hook 提示了几份 |
| 📚 | 蓝 | 读了哪些 skill references；按需加载的 rules 和子目录 `CLAUDE.md` |
| 🛡 | 白 | hook 在工具调用前后插进来的提醒 |
| ⛔ | 红 | 被哪个 hook 拦下 |
| ⚠️ | 黄 | 「N 次工具，没用上任何 skill / 记忆 / 规则」或「提示了 N 份记忆，一份没读」 |

不计入的：根目录 `CLAUDE.md`、`AGENTS.md`、`MEMORY.md` 每轮都会加载，`UserPromptSubmit` hook 每条指令都附带的提示也一样，算进去条条都会显示命中，所以不算。

敲 `/route` 打开详情：每一项具体是哪些文件、哪些 hook，以及之前的指令（每条一行）。

route-lens 只看不改：它挂的每个 hook 都原样返回引擎的结果，不会修改、拖延或拦下任何工具调用、提示或别的 hook。

### 安装

在 Claude Code 终端会话里（需要 v2.1.287 或以上）：

```
/plugin install route-lens --marketplace Buer2333/route-lens
```

提示添加 marketplace 时回 `y`，再选安装范围（user = 所有会话都生效）。

在 shell 里：

```
claude plugin install route-lens --marketplace Buer2333/route-lens
```

### 在状态栏里显示

route-lens 把带颜色的那一行写到 `~/.claude/route-lens/<会话 ID>.txt`，由你的状态栏脚本打印出来。仓库里的 `statusline/route-lens-line.sh` 就是干这个的，接法见上方英文部分的两种写法：还没有状态栏就直接用它；已经有了，就在脚本里加一行调用它。

### 界面语言

默认英文。要中文：敲 `/plugin`，选 route-lens，把它的 `language` 选项设为 `zh`。Claude Code 会存进设置里的 `pluginConfigs` 并重新加载这个 mod。

### 限制

- 按约定的路径识别：`.claude/` 下 `memory/`、`skills/`、`rules/` 里的 `.md`（包括 `~/.claude/projects/*/memory/` 和插件自带的 skill）。只认 `cat`、`sed`、`head`、`tail`、`less`、`awk`、`bat` 这类读文件的命令，别的命令里顺带提到的路径不算。
- 「提示了几份记忆」依赖你自己有一个 `UserPromptSubmit` hook，在附加内容里写出 memory 文件路径；没有这个 hook，这一项就一直是空的。
- `~/.claude/route-lens/` 下每个会话一个文件，只有几百字节，随时可以删。

MIT 许可。
