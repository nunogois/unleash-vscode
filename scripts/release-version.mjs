import { readFileSync } from 'node:fs';

// Validate before the version is used in a filename, git ref or shell command.
export function validateVersion(version, current) {
  const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  if (version.match(pattern)?.[0] !== version) throw new Error('Use a version such as 0.1.3, without v, a prerelease suffix or build metadata.');
  const parts = version.split('.').map(BigInt);
  const previous = current.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (parts[i] > previous[i]) return version;
    if (parts[i] < previous[i]) throw new Error(`Version must be at least ${current}.`);
  }
  return version;
}

if (process.env.RELEASE_VERSION !== undefined) {
  validateVersion(process.env.RELEASE_VERSION, JSON.parse(readFileSync('package.json', 'utf8')).version);
}
