// The link to the project's public discussions that the dashboard offers as "Help" (docs/plans/community/github-discussions-plan.md).
//   COMMUNITY_URL unset  -> the project's GitHub Discussions
//   COMMUNITY_URL=       -> empty: no Help entry (an installation that keeps its administrators off the public internet)
//   COMMUNITY_URL=<url>  -> that address (an internal forum, a different repository); anything that is not an http or https URL hides the entry
// Only a link: the person follows it, nothing about the installation, the user or the data is sent anywhere (docs/release/security/data-protection.md).
export const DEFAULT_COMMUNITY_URL = 'https://github.com/swina/whoobe_project/discussions';

export function communityUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.COMMUNITY_URL;
  if (raw === undefined) return DEFAULT_COMMUNITY_URL;
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}
