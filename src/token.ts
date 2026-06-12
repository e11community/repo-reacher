import {setSecret} from '@actions/core'
import {createAppAuth} from '@octokit/auth-app'
import {request} from '@octokit/request'

export interface MintArgs {
  appId: string
  privateKey: string
  owner: string
  repositories?: string[]
  permissions?: Record<string, string>
}

// Replicates the core of actions/create-github-app-token: sign a JWT as the
// App (the private key never leaves the runner), discover the installation for
// `owner`, then exchange for a short-lived installation token scoped to the
// listed repositories (or the full grant when `repositories` is undefined) and
// narrowed to `permissions` (a subset of the App's grant; never an escalation).
export async function mintToken({appId, privateKey, owner, repositories, permissions}: MintArgs): Promise<string> {
  const auth = createAppAuth({appId, privateKey, request})

  const app = await auth({type: 'app'})
  const installationId = await findInstallationId(app.token, owner)

  const installation = await auth({
    type: 'installation',
    installationId,
    repositoryNames: repositories,
    permissions,
  })

  setSecret(installation.token)
  return installation.token
}

// An installation belongs to an org or a user account; try org first, fall back
// to user on 404.
async function findInstallationId(jwt: string, owner: string): Promise<number> {
  const headers = {authorization: `Bearer ${jwt}`}
  try {
    const {data} = await request('GET /orgs/{org}/installation', {org: owner, headers})
    return data.id
  } catch (err) {
    if (status(err) === 404) {
      const {data} = await request('GET /users/{username}/installation', {username: owner, headers})
      return data.id
    }
    throw new Error(`Could not find a Repo Reader installation for "${owner}": ${message(err)}`)
  }
}

function status(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const value = (err as {status: unknown}).status
    if (typeof value === 'number') return value
  }
  return undefined
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : JSON.stringify(err)
}
