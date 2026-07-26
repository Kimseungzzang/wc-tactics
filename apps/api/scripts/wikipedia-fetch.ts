import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CACHE_DIR = join(__dirname, '..', '.cache', 'wikipedia');
// Wikipedia's API etiquette requires an identifying User-Agent - requests
// without one get much more aggressively rate-limited.
const USER_AGENT =
  'wc-tactics-hackathon-dataimport/1.0 (research use; contact: ksjhbrc@gmail.com)';

async function readCache(cachePath: string): Promise<string | null> {
  try {
    return await readFile(cachePath, 'utf-8');
  } catch {
    return null;
  }
}

async function writeCache(cachePath: string, data: string): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, data);
}

/** Fetches a Wikipedia page's raw wikitext (not rendered HTML) via the
 * MediaWiki API, cached to disk so re-running the seed script doesn't
 * re-hit Wikipedia (and doesn't risk rate-limiting) once fetched once. */
export async function fetchWikitext(page: string): Promise<string> {
  const cachePath = join(
    CACHE_DIR,
    `${page.replace(/[^a-zA-Z0-9]/g, '_')}.wikitext`,
  );
  const cached = await readCache(cachePath);
  if (cached) return cached;

  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch Wikipedia page "${page}": ${res.status} ${res.statusText}`,
    );
  }
  const json = (await res.json()) as {
    parse?: { wikitext?: { '*': string } };
    error?: { info: string };
  };
  if (json.error || !json.parse?.wikitext) {
    throw new Error(
      `Wikipedia API error for "${page}": ${json.error?.info ?? 'no wikitext returned'}`,
    );
  }
  const wikitext = json.parse.wikitext['*'];
  await writeCache(cachePath, wikitext);
  return wikitext;
}
