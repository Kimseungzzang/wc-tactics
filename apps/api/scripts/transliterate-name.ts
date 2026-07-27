/**
 * Best-effort automatic Latin-script -> Hangul phonetic transliteration,
 * for localizing the 1248 real player names seeded from Wikipedia (see
 * seed-wikipedia-2026.ts). This is NOT the "official" Korean sports-media
 * spelling for any given player - just a generic rule-based reading, so
 * unusual results are expected for names outside common English/Romance
 * patterns (explicitly accepted - see the request this was built for).
 *
 * Approach: normalize accents away, then build the word as a list of
 * {onset, nucleus, coda} syllable descriptors (not a string) so a
 * trailing consonant can be folded into the syllable already built for
 * it, then compose every descriptor to a real Hangul character at the
 * very end via the standard Unicode Hangul syllable formula.
 */

// JUNG (medial vowel) index layout, for reference:
// 0ㅏ 1ㅐ 2ㅑ 3ㅒ 4ㅓ 5ㅔ 6ㅕ 7ㅖ 8ㅗ 9ㅘ 10ㅙ 11ㅚ 12ㅛ 13ㅜ 14ㅝ 15ㅞ 16ㅟ 17ㅠ 18ㅡ 19ㅢ 20ㅣ

const ONS_A = 0; // ㄱ
const ONS_N = 2; // ㄴ
const ONS_D = 3; // ㄷ
const ONS_R = 5; // ㄹ
const ONS_M = 6; // ㅁ
const ONS_B = 7; // ㅂ
const ONS_S = 9; // ㅅ
const ONS_NG = 11; // ㅇ (glottal/silent onset)
const ONS_J = 12; // ㅈ
const ONS_CH = 14; // ㅊ
const ONS_K = 15; // ㅋ
const ONS_T = 16; // ㅌ
const ONS_P = 17; // ㅍ
const ONS_H = 18; // ㅎ

const V_A = 0; // ㅏ
const V_E = 5; // ㅔ
const V_YA = 2; // ㅑ
const V_YEO = 6; // ㅕ
const V_O = 8; // ㅗ
const V_WA = 9; // ㅘ
const V_OE = 11; // ㅚ
const V_YO = 12; // ㅛ
const V_U = 13; // ㅜ
const V_WEO = 14; // ㅝ
const V_WI = 16; // ㅟ
const V_YU = 17; // ㅠ
const V_EU = 18; // ㅡ
const V_I = 20; // ㅣ

// Only these onsets have a clean single-jamo batchim; anything else that
// ends up dangling gets its own filler-vowel syllable instead.
const CODA_MAP: Partial<Record<number, number>> = {
  [ONS_A]: 1, // ㄱ
  [ONS_N]: 4, // ㄴ
  [ONS_D]: 7, // ㄷ (t/d finals)
  [ONS_R]: 8, // ㄹ
  [ONS_M]: 16, // ㅁ
  [ONS_B]: 17, // ㅂ (p/b/f/v finals)
  [ONS_S]: 19, // ㅅ
  [ONS_NG]: 21, // ㅇ
};

interface Syllable {
  cho: number;
  jung: number;
  jong: number;
}

function composeSyllable(s: Syllable): string {
  return String.fromCharCode(0xac00 + (s.cho * 21 + s.jung) * 28 + s.jong);
}

const ONSET_DIGRAPHS: [string, number][] = [
  ['tch', ONS_CH],
  ['sch', ONS_S],
  ['ch', ONS_CH],
  ['sh', ONS_S],
  ['th', ONS_S],
  ['ph', ONS_P],
  ['gh', ONS_A],
  ['ck', ONS_K],
  ['qu', ONS_K],
  ['gn', ONS_N],
  ['kh', ONS_K],
];
const ONSET_SINGLE: Record<string, number> = {
  b: ONS_B,
  d: ONS_D,
  f: ONS_P,
  g: ONS_A,
  h: ONS_H,
  j: ONS_J,
  k: ONS_K,
  l: ONS_R,
  m: ONS_M,
  n: ONS_N,
  p: ONS_P,
  q: ONS_K,
  r: ONS_R,
  s: ONS_S,
  t: ONS_T,
  v: ONS_B,
  z: ONS_J,
};

const VOWEL_DIGRAPHS: [string, number][] = [
  ['igh', V_A],
  ['eau', V_O],
  ['ee', V_I],
  ['ea', V_I],
  ['ie', V_I],
  ['ei', V_E],
  ['ey', V_E],
  ['ai', V_E],
  ['ay', V_E],
  ['oi', V_OE],
  ['oy', V_OE],
  ['oo', V_U],
  ['ou', V_U],
  ['ow', V_O],
  ['au', V_O],
  ['aw', V_O],
  ['ue', V_U],
  ['ui', V_WI],
];
const VOWEL_SINGLE: Record<string, number> = {
  a: V_A,
  e: V_E,
  i: V_I,
  o: V_O,
  u: V_U,
};

function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function isVowelLetter(c: string): boolean {
  return 'aeiou'.includes(c);
}

function isConsonantLetter(c: string): boolean {
  return /^[bcdfghjklmnpqrstvwxyz]$/.test(c);
}

function matchOnset(rest: string): { cho: number; len: number } | null {
  const digraph = ONSET_DIGRAPHS.find(([g]) => rest.startsWith(g));
  if (digraph) return { cho: digraph[1], len: digraph[0].length };
  const c = rest[0];
  if (c === 'c') {
    // Soft c (city/century) vs hard c (cat/cold) - approximated by the
    // following letter, same convention English spelling itself uses.
    const soft = 'eiy'.includes(rest[1] ?? '');
    return { cho: soft ? ONS_S : ONS_K, len: 1 };
  }
  if (c != null && ONSET_SINGLE[c] != null)
    return { cho: ONSET_SINGLE[c], len: 1 };
  return null;
}

function matchNucleus(rest: string): { jung: number; len: number } | null {
  const digraph = VOWEL_DIGRAPHS.find(([g]) => rest.startsWith(g));
  if (digraph) return { jung: digraph[1], len: digraph[0].length };
  const c = rest[0];
  if (c != null && VOWEL_SINGLE[c] != null)
    return { jung: VOWEL_SINGLE[c], len: 1 };
  if (c === 'y') return { jung: V_I, len: 1 };
  return null;
}

const Y_GLIDE: Record<string, number> = {
  a: V_YA,
  e: V_YEO,
  i: V_I,
  o: V_YO,
  u: V_YU,
};
const W_GLIDE: Record<string, number> = {
  a: V_WA,
  e: V_WEO,
  i: V_WI,
  o: V_O,
  u: V_U,
};

/** Attaches a dangling onset consonant to whatever syllable already
 * exists for it - as a batchim on the previous syllable if there is one
 * and it's still free, otherwise as its own filler-vowel (ㅡ) syllable. */
function attachDangling(syllables: Syllable[], cho: number): void {
  const prev = syllables[syllables.length - 1];
  if (prev && prev.jong === 0 && CODA_MAP[cho] != null) {
    prev.jong = CODA_MAP[cho]!;
  } else {
    syllables.push({ cho, jung: V_EU, jong: 0 });
  }
}

function transliterateWord(rawWord: string): string {
  // Doubled consonants (Messi, Guillermo, Ronaldinho's "nn" etc.) are a
  // single sound for transliteration purposes - collapsing them upfront
  // sidesteps a coda+onset split that would otherwise insert an extra
  // syllable. Vowel doubles (ee/oo) are left alone; they're handled as
  // recognized digraphs above.
  const word = rawWord
    .replace(/x/g, 'ks')
    .replace(/([bcdfghjklmnpqrstvwyz])\1+/g, '$1');

  const syllables: Syllable[] = [];
  let i = 0;
  while (i < word.length) {
    const c = word[i];
    const next = word[i + 1];

    if (c === 'y' && next != null && isVowelLetter(next)) {
      syllables.push({ cho: ONS_NG, jung: Y_GLIDE[next] ?? V_I, jong: 0 });
      i += 2;
      continue;
    }
    if (c === 'w' && next != null && isVowelLetter(next)) {
      syllables.push({ cho: ONS_NG, jung: W_GLIDE[next] ?? V_U, jong: 0 });
      i += 2;
      continue;
    }

    const onset = isVowelLetter(c) ? null : matchOnset(word.slice(i));
    const choStart = i;
    const cho = onset?.cho ?? ONS_NG;
    i += onset?.len ?? 0;

    if (i >= word.length) {
      if (onset) attachDangling(syllables, cho);
      break;
    }

    const nucleus = matchNucleus(word.slice(i));
    if (!nucleus) {
      // This consonant has nothing to pair with right now (consonant
      // cluster, e.g. the "s" in "strand") - resolve it on its own and
      // retry from here without it.
      if (onset) attachDangling(syllables, cho);
      else i = choStart + 1; // stray character (digit/punctuation slipped through) - skip it
      continue;
    }
    i += nucleus.len;
    syllables.push({ cho, jung: nucleus.jung, jong: 0 });

    // A single consonant right after this nucleus that isn't itself
    // followed by a vowel belongs to THIS syllable as its batchim,
    // rather than becoming the next syllable's onset.
    const trailing = word[i];
    if (
      trailing != null &&
      isConsonantLetter(trailing) &&
      trailing !== 'y' &&
      trailing !== 'w'
    ) {
      const afterTrailing = word[i + 1];
      const trailingStartsVowel =
        afterTrailing != null &&
        (isVowelLetter(afterTrailing) || afterTrailing === 'y');
      if (!trailingStartsVowel) {
        const trailingOnset =
          trailing === 'c'
            ? matchOnset(word.slice(i))?.cho
            : ONSET_SINGLE[trailing];
        if (trailingOnset != null && CODA_MAP[trailingOnset] != null) {
          syllables[syllables.length - 1].jong = CODA_MAP[trailingOnset]!;
          i += 1;
        }
      }
    }
  }

  return syllables.map(composeSyllable).join('');
}

/** Transliterates a full name (possibly multiple words separated by
 * spaces, hyphens, or apostrophes), preserving those separators. */
export function transliterateName(name: string): string {
  const normalized = stripAccents(name).toLowerCase();
  return normalized.replace(
    /[a-z]+/g,
    (word) => transliterateWord(word) || word,
  );
}
