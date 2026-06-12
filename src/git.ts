import {exec} from '@actions/exec'

// Rewrite plain github.com/<owner>/ HTTPS URLs to carry the installation token.
// Scoped to the owner prefix (not all of github.com) so each owner uses its own
// token; git picks the longest-matching insteadOf prefix. This is global config
// on an ephemeral runner, so later steps in the job authenticate transparently.
export async function configureGit(owner: string, token: string): Promise<void> {
  const base = `https://github.com/${owner}/`
  const authed = `https://x-access-token:${token}@github.com/${owner}/`

  await exec('git', ['config', '--global', `url.${authed}.insteadOf`, base])
}
