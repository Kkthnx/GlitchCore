/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Expanded Filter Definitions using word boundaries to prevent false positives (e.g., 'spice' triggering 'spic')
const politicalRegex = /\b(trump|biden|obama|hillary|kamala|pelosi|mcconnell|democrat|republican|libtard|conservatard|maga|antifa|qanon|alt-right|proud boys|leftist|right-wing|fascist|marxist)\b/i;

const racistRegex = /\b(nigger|nigga|n1gga|n1gger|nibba|faggot|fag|tranny|shemale|dyke|chink|gook|zipperhead|spic|wetback|beaner|kike|kyke|towelhead|camel jockey|sand nigger|porch monkey|jigaboo|coon|retard)\b/i;

const analRegex = /\banal\b/i;

// Regex matching Chinese Hanzi, Japanese Kanji/Kana, and Korean Hangul
const cjkRegex = /[\u2E80-\u2FD5\u3190-\u319f\u3400-\u4DBF\u4E00-\u9FCC\uF900-\uFAAD\u3041-\u3096\u30A0-\u30FF\uAC00-\uD7AF\u1100-\u11FF]/;

const clapbacks = [
    "Nice try, {user}, but we don't do that here. Go back to Twitter! 🤡",
    "Did you really think that was gonna work, {user}? Straight to the shadow realm. 🔨",
    "{user} just tried to bypass the filter. Everyone point and laugh! 🫵😂",
    "Mods, twist {user}'s testicles counter-clockwise. 🧙‍♂️",
    "We caught that in 4K, {user}. Not in this server. 📸",
    "Yikes, {user}... maybe take a walk outside? 🌿",
    "{user}'s message was so bad it made the auto-mod throw up. 🤮",
    "Error 404: Braincells not found for {user}. 🤖"
];

function checkMessage(content) {
    // Slurs with a zero-width space slipped between letters, or Cyrillic
    // lookalikes swapped in, sail past word-boundary matching on the raw text.
    // NFKC folds the lookalikes back to ASCII and the strip pass removes the
    // invisible joiners, so test both forms: raw first (preserves existing
    // behavior), then normalized to close the trivial bypass.
    const normalized = normalizeForFilter(content);
    return checkRaw(content) || (normalized !== content ? checkRaw(normalized) : null);
}

// NFKC compatibility decomposition (fullwidth and lookalike letters fold to
// their ASCII forms), then strip zero-width and other format characters that
// carry no visible text. \p{Cf} needs the u flag.
// NFKC does not fold cross-script lookalikes (a Cyrillic "е" is a different
// letter, not a compatibility variant), so the targeted map below covers the
// most abused Cyrillic/Greek twins by hand. This is a subset, not the full
// Unicode confusables table: enough to close the easy bypass.
const CONFUSABLES = new Map(Object.entries({
    '\u0430': 'a', '\u0410': 'A', // Cyrillic a
    '\u0435': 'e', '\u0415': 'E', // Cyrillic ie
    '\u043e': 'o', '\u041e': 'O', // Cyrillic o
    '\u0440': 'p', '\u0420': 'P', // Cyrillic er
    '\u0441': 'c', '\u0421': 'C', // Cyrillic es
    '\u0445': 'x', '\u0425': 'X', // Cyrillic ha
    '\u0456': 'i', '\u0406': 'I', // Cyrillic dotted i
    '\u0458': 'j', '\u0408': 'J', // Cyrillic je
    '\u0455': 's', '\u0405': 'S', // Cyrillic dze
    '\u043a': 'k', '\u041a': 'K', // Cyrillic ka
    '\u043c': 'm', '\u041c': 'M', // Cyrillic em
    '\u043d': 'h', '\u041d': 'H', // Cyrillic en
    '\u03bf': 'o', '\u03cc': 'o', // Greek omicron
    '\u03c1': 'p', '\u03f1': 'p', // Greek rho
    '\u03b5': 'e', '\u03ad': 'e', // Greek epsilon
    '\u03b9': 'i', '\u03af': 'i', // Greek iota
    '\u03ba': 'k', // Greek kappa
    '\u03bd': 'v', // Greek nu
    '\u03c7': 'x', // Greek chi
    '\u03c4': 't', // Greek tau
}));
const CONFUSABLE_RE = new RegExp(`[${[...CONFUSABLES.keys()].join('')}]`, 'g');

function normalizeForFilter(content) {
    return String(content || '')
        .normalize('NFKC')
        .replace(CONFUSABLE_RE, ch => CONFUSABLES.get(ch))
        .replace(/[\u200b-\u200d\uFEFF]/g, '')
        .replace(/\p{Cf}/gu, '');
}

function checkRaw(content) {
    // Check Politics
    if (politicalRegex.test(content)) {
        return 'American Politics';
    }

    // Check Racism
    if (racistRegex.test(content)) {
        return 'Racism/Slurs';
    }

    // Check Anal Spam
    if (analRegex.test(content)) {
        return '"Anal" Spammer';
    }

    // Check CJK
    if (cjkRegex.test(content)) {
        return 'Chinese/Korean/Japanese Characters';
    }

    return null;
}

function getRandomClapback(userMention) {
    const index = Math.floor(Math.random() * clapbacks.length);
    return clapbacks[index].replace('{user}', userMention);
}

module.exports = {
    checkMessage,
    normalizeForFilter,
    getRandomClapback
};
