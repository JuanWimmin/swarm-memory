// PreToolUse hook: refuse Edit/Write on the OTA updater files (TEAM_PLAN §3 / CLAUDE.md rule 2).
// Reads the hook payload from stdin and answers with a PreToolUse permission decision.
let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => {
  raw += c
})
process.stdin.on('end', () => {
  let input = {}
  try {
    input = JSON.parse(raw || '{}')
  } catch {}
  const ti = input.tool_input || {}
  const fp = String(ti.file_path || ti.path || '')
  const BACKSLASH = String.fromCharCode(92)
  const norm = fp.split(BACKSLASH).join('/').toLowerCase()
  const protectedFiles = ['/app.js', '/workers/main.js']
  const hit = protectedFiles.find((p) => norm.endsWith(p))
  if (!hit) process.exit(0)
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'SwarmMemory guard: ' +
          hit +
          ' es el updater OTA del template (hello-pear-bare main) y NO se toca (CLAUDE.md regla 2). ' +
          'Solo B1 puede cambiarlo conscientemente: quita este hook de .claude/settings.json si de verdad hace falta.'
      }
    })
  )
  process.exit(0)
})
