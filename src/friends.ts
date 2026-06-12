// A friend line is either a bare `owner` or `owner/repo`. Bare owner means
// "the full installation grant" (no repositories filter); `owner/repo` narrows
// the token to the listed repo(s). A bare owner supersedes any `owner/repo`
// lines for the same owner, since it is the wider scope.
export type Scope = {repositories: string[]} | 'ALL'

export function parseFriends(raw: string): Map<string, Scope> {
  const owners = new Map<string, Scope>()

  for (const line of raw
    .split('\n')
    // Tolerate YAML-list muscle memory: a leading `- ` bullet is stripped so
    // `- owner` and `owner` are equivalent. Without this, the bullet becomes
    // part of the owner name and the installation lookup 404s.
    .map(l => l.trim().replace(/^-\s+/, ''))
    .filter(Boolean)) {
    const slash = line.indexOf('/')

    if (slash === -1) {
      owners.set(line, 'ALL')
      continue
    }

    const owner = line.slice(0, slash)
    const repo = line.slice(slash + 1)
    if (!owner || !repo || repo.includes('/')) {
      throw new Error(`Malformed friend line: "${line}" (expected "owner" or "owner/repo")`)
    }

    const current = owners.get(owner)
    if (current === 'ALL') continue // bare owner already covers everything
    if (current) {
      if (!current.repositories.includes(repo)) current.repositories.push(repo)
    } else {
      owners.set(owner, {repositories: [repo]})
    }
  }

  return owners
}
