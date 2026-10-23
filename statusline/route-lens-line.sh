#!/bin/sh
# Prints the route-lens row for the current session, if there is one.
# Claude Code pipes the status line JSON on stdin; route-lens writes ~/.claude/route-lens/<session_id>.txt.
#
# Standalone (no status line yet), in ~/.claude/settings.json:
#   "statusLine": { "type": "command", "command": "sh /path/to/route-lens-line.sh", "refreshInterval": 3 }
#
# Already have a status line script? Read stdin once, keep your output, then add:
#   printf '%s' "$input" | sh /path/to/route-lens-line.sh

input=$(cat)
sid=$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
[ -n "$sid" ] || exit 0
file="$HOME/.claude/route-lens/$sid.txt"
[ -f "$file" ] && cat "$file"
exit 0
