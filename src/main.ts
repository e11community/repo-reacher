import {getInput, info, setFailed} from '@actions/core'
import {resolveCredentials} from './credentials'
import {parseFriends} from './friends'
import {mintToken} from './token'
import {configureGit} from './git'

export async function run(): Promise<void> {
  try {
    const credentials = resolveCredentials()
    const friends = parseFriends(getInput('friends', {required: true}))

    if (friends.size === 0) {
      throw new Error('`friends` resolved to zero owners; nothing to authorize')
    }

    for (const [owner, scope] of friends) {
      const repositories = scope === 'ALL' ? undefined : scope.repositories
      const label = repositories ? `${owner} (${repositories.join(', ')})` : `${owner} (all authorized repos)`
      info(`Authorizing ${label}`)

      // One installation token per owner, scoped to the owner's listed repos
      // (or the full installation grant for a bare owner). The git rewrite is
      // per-owner, so every github.com/<owner>/ clone in later steps uses it.
      const token = await mintToken({...credentials, owner, repositories})
      await configureGit(owner, token)
    }

    info(`Configured git for ${friends.size} owner(s).`)
  } catch (err) {
    setFailed(err instanceof Error ? err.message : JSON.stringify(err))
  }
}
