/**
 * The check run. A comment is for a reader; a check run is for branch protection
 * — it is the half that can actually stop a merge, and it is why the thresholds
 * are worth configuring at all.
 *
 * With no threshold set the conclusion is `neutral`, never `success`: a green
 * tick that means "nobody asked for anything" reads as a passing quality gate to
 * every human who sees it, and there is no gate.
 */
export async function writeCheckRun(
  client,
  {
    owner,
    repo,
    sha,
    name,
    title,
    summary,
    failures = [],
    gated = false,
    detailsUrl = null
  }
) {
  const conclusion =
    failures.length > 0 ? 'failure' : gated ? 'success' : 'neutral';

  return client.post(`/repos/${owner}/${repo}/check-runs`, {
    name,
    head_sha: sha,
    status: 'completed',
    conclusion,
    details_url: detailsUrl ?? undefined,
    output: {
      title,
      summary:
        failures.length > 0
          ? `${summary}\n\n${failures.map((line) => `- ${line}`).join('\n')}`
          : summary
    }
  });
}
