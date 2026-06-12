import {getInput, info, setFailed} from '@actions/core'
import {resolveCredentials} from './credentials'
import {parseFriends} from './friends'
import {parsePermissions} from './permissions'
import {mintToken} from './token'
import {configureGit} from './git'

export async function run(): Promise<void> {
  try {
    const credentials = resolveCredentials()
    const friends = parseFriends(getInput('friends', {required: true}))
    const permissions = parsePermissions(getInput('permissions'))

    if (friends.size === 0) {
      throw new Error('`friends` resolved to zero owners; nothing to authorize')
    }

    info(permissions ? `Minting tokens narrowed to: ${describePermissions(permissions)}` : 'Minting tokens with the full App installation grant')

    for (const [owner, scope] of friends) {
      const repositories = scope === 'ALL' ? undefined : scope.repositories
      const label = repositories ? `${owner} (${repositories.join(', ')})` : `${owner} (all authorized repos)`
      info(`Authorizing ${label}`)

      // One installation token per owner, scoped to the owner's listed repos
      // (or the full installation grant for a bare owner) and narrowed to the
      // requested permissions. The git rewrite is per-owner, so every
      // github.com/<owner>/ clone in later steps uses it.
      const token = await mintToken({...credentials, owner, repositories, permissions})
      await configureGit(owner, token)
    }

    info(`Configured git for ${friends.size} owner(s).`)
  } catch (err) {
    setFailed(err instanceof Error ? err.message : JSON.stringify(err))
  }
}

function describePermissions(permissions: Record<string, string>): string {
  return Object.entries(permissions)
    .map(([name, level]) => `${name}:${level}`)
    .join(', ')
}
