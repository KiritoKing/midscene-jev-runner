export function planRelease(input: {
  event?: string;
  ref?: string;
  version: string;
  previousVersion?: string;
  tag?: string;
  prerelease?: string;
}): { should_publish: string; release_tag?: string; prerelease?: string };
