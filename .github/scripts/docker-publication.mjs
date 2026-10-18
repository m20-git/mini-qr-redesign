import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function publicationPlan({ eventName, ref, sha, expectedSha, owner, release }) {
  if (!/^[0-9a-f]{40}$/.test(sha || '') || sha !== expectedSha) {
    throw new Error('Publication must use the exact tested event SHA');
  }
  const namespace = String(owner || '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(namespace)) throw new Error('Invalid registry namespace');
  const image = `ghcr.io/${namespace}/mini-qr`;
  const tags = [`${image}:sha-${sha}`];
  let version;
  if (eventName === 'push' && ref === 'refs/heads/main') {
    tags.push(`${image}:main`);
    version = 'main';
  } else if (eventName === 'release' && release?.draft === false && typeof release.prerelease === 'boolean') {
    const tag = release.tag_name;
    if (typeof tag !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag)) {
      throw new Error('Release tag is not a valid Docker tag');
    }
    if (['main', 'latest', 'release'].includes(tag.toLowerCase()) || /^sha-/i.test(tag)) {
      throw new Error('Release tag collides with a reserved publication tag');
    }
    if (ref !== `refs/tags/${tag}`) throw new Error('Release ref does not match the released tag');
    tags.push(`${image}:${tag}`);
    if (!release.prerelease) tags.push(`${image}:release`, `${image}:latest`);
    version = tag;
  } else {
    throw new Error('Only main pushes and published releases may publish');
  }
  return { image, tags, version, cache: `ghcr.io/${namespace}/mini-qr-build-cache:mini-qr` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    if (process.env.GITHUB_EVENT_NAME === 'release' && event.action !== 'published') {
      throw new Error('Release action must be published');
    }
    const plan = publicationPlan({
      eventName: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA, expectedSha: process.env.SOURCE_SHA,
      owner: process.env.GITHUB_REPOSITORY_OWNER, release: event.release
    });
    appendFileSync(process.env.GITHUB_OUTPUT,
      `tags<<DOCKER_TAGS\n${plan.tags.join('\n')}\nDOCKER_TAGS\nversion=${plan.version}\ncache=${plan.cache}\n`);
    console.log(JSON.stringify(plan, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
