/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { checkMessage } = require('./filterManager');
const { containsInvite, containsScamDomain } = require('./antiSpam');

const CJK_VIOLATION = 'Chinese/Korean/Japanese Characters';

/** Shown to a member whose text was refused. */
const TEXT_REFUSED = 'That text tripped the word filter. Try different wording.';

/**
 * Checks text a member typed into a command before the bot repeats it in a
 * channel. Messages go through the auto-mod, but a command option posted by the
 * bot never did, so a slur in an AFK reason or an LFG title went up under the
 * bot's name.
 *
 * CJK is allowed here. The message filter only restricts it for fresh accounts,
 * and game titles in Korean or Japanese are ordinary input.
 *
 * @param {...string} texts any number of inputs, empty ones are skipped
 * @returns {string|null} the violation category, or null when everything is fine
 */
function screenText(...texts) {
    for (const text of texts) {
        if (!text) continue;
        const violation = checkMessage(text);
        if (violation && violation !== CJK_VIOLATION) return violation;
        if (containsInvite(text)) return 'Invite link';
        if (containsScamDomain(text)) return 'Scam link';
    }
    return null;
}

module.exports = { screenText, TEXT_REFUSED };
