export function verifyReleaseIdentity(
  metadata: { tag_name: string; draft: boolean; prerelease: boolean },
  object: { type: string; sha: string },
  tag: string,
  sha: string,
): void;
