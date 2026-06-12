// Installation tokens can be narrowed at mint time to a subset of what the App
// was granted — never escalated. This lets a workflow author pin the temp token
// to e.g. `contents:read` even if an org admin granted the App write, so other
// steps in the job cannot accidentally push.
//
// Input format: comma- or newline-delimited `name:level` pairs, where level is
// read | write | admin (the values the installation-token API accepts). The
// sentinel `inherit` (or an empty value) means "use the App installation's full
// grant" — no narrowing.
const LEVELS = new Set(['read', 'write', 'admin'])

export function parsePermissions(raw: string): Record<string, string> | undefined {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'inherit') return undefined

  const permissions: Record<string, string> = {}
  for (const pair of trimmed
    .split(/[\n,]/)
    .map(p => p.trim())
    .filter(Boolean)) {
    const colon = pair.indexOf(':')
    if (colon === -1) {
      throw new Error(`Malformed permission "${pair}" (expected "name:level", e.g. "contents:read")`)
    }

    const name = pair.slice(0, colon).trim()
    const level = pair
      .slice(colon + 1)
      .trim()
      .toLowerCase()
    if (!name || !LEVELS.has(level)) {
      throw new Error(`Malformed permission "${pair}" (level must be one of: ${[...LEVELS].join(', ')})`)
    }

    permissions[name] = level
  }

  return permissions
}
