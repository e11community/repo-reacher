import {getInput, setSecret} from '@actions/core'

const BASE64 = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/

export interface Credentials {
  appId: string
  privateKey: string
}

// An action cannot read a workflow secret by name — GitHub never injects the
// secret store into the runner. The workflow must map the App ID and key into
// env (e.g. `REPO_REACHER_KEY: ${{ secrets.REPO_REACHER_KEY }}`); we read them
// from there. The *_env inputs only override which env var name we look at.
export function resolveCredentials(): Credentials {
  const appIdEnv = getInput('app_id_env') || 'REPO_REACHER_APP_ID'
  const keyEnv = getInput('private_key_env') || 'REPO_REACHER_KEY'

  const appId = process.env[appIdEnv]
  if (!appId) {
    throw new Error(
      `App ID not found in env var \`${appIdEnv}\`. Map it in your workflow, e.g.\n` +
        `    env:\n      ${appIdEnv}: \${{ vars.REPO_REACHER_APP_ID }}`,
    )
  }

  let privateKey = process.env[keyEnv]
  if (!privateKey) {
    throw new Error(
      `Private key not found in env var \`${keyEnv}\`. Map it in your workflow, e.g.\n` +
        `    env:\n      ${keyEnv}: \${{ secrets.REPO_REACHER_KEY }}`,
    )
  }
  setSecret(privateKey)

  // CI secret stores frequently hold the PEM base64-encoded. A raw PEM contains
  // the `PRIVATE KEY` armor and is not valid base64, so detect and decode only
  // when it looks encoded.
  if (!privateKey.includes('PRIVATE KEY') && BASE64.test(privateKey.replace(/\s/g, ''))) {
    privateKey = Buffer.from(privateKey, 'base64').toString('utf8')
    setSecret(privateKey)
  }

  return {appId, privateKey}
}
