/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Decides whether text typed into a slash command option is a usable emoji.
//
// A self-role's emoji is stored as typed and rebuilt into the /roles picker on
// every open. Discord rejects a menu option whose emoji is not a real emoji, so
// one typo stored here would break the whole picker for every member until an
// admin tracked it down. Checking at the door is far cheaper than that.

// A server emoji, like <:name:123456789012345678> or <a:name:123456789012345678>.
const CUSTOM_EMOJI = /^<a?:\w{2,32}:\d{17,20}>$/;

// A keycap, like 1 followed by the enclosing keycap mark.
const KEYCAP = /^[0-9#*]️?⃣$/u;

// Anything emoji-like, including flags (pairs of regional indicators).
const PICTOGRAPH = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

// Plain ASCII letters and digits. A real unicode emoji never contains them, so
// their presence means ordinary text, such as "hello" or "gg2".
const ASCII_WORD = /[A-Za-z0-9]/;

/**
 * @param {string|null|undefined} input
 * @returns {boolean}
 */
function isValidEmoji(input) {
    if (typeof input !== 'string') return false;
    const s = input.trim();
    if (!s) return false;

    if (CUSTOM_EMOJI.test(s)) return true;
    if (KEYCAP.test(s)) return true;

    return PICTOGRAPH.test(s) && !ASCII_WORD.test(s);
}

module.exports = { isValidEmoji };
