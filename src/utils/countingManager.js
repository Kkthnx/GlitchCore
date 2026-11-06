/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const Counting = require('../database/CountingSchema');
const { postTempNotice } = require('./autoMod');
const logger = require('./logger');

const MILESTONE_EVERY = 100;
// Anything longer than this is chatter, not a count, and must not reach Number().
const MAX_DIGITS = 9;
const NUMBER_ONLY = /^\d+$/;

/**
 * Decides what a message means for the count. Pure so every branch is testable.
 *
 * - ignore: not a bare number, so chat in the channel is left alone
 * - ok: the next number from someone who did not count last
 * - repeat: the right number but from the member who counted last
 * - late: a number that was already taken, usually two people racing
 * - wrong: any other number, which resets the count
 *
 * @param {{ current: number, lastUserId: string|null }} state
 * @returns {{ kind: 'ignore'|'ok'|'repeat'|'late'|'wrong', number?: number }}
 */
function evaluateCount(state, userId, content) {
    const text = String(content ?? '').trim();
    if (!NUMBER_ONLY.test(text) || text.length > MAX_DIGITS) return { kind: 'ignore' };

    const number = Number(text);
    if (number <= state.current && number > 0) return { kind: 'late', number };
    if (number !== state.current + 1) return { kind: 'wrong', number };
    if (state.lastUserId === userId) return { kind: 'repeat', number };
    return { kind: 'ok', number };
}

async function loadState(guildId) {
    return Counting.findOneAndUpdate(
        { guildId },
        { $setOnInsert: { guildId } },
        { upsert: true, returnDocument: 'after' },
    ).lean();
}

async function resetCount(guildId) {
    return Counting.findOneAndUpdate(
        { guildId },
        { $set: { current: 0, lastUserId: null }, $inc: { resets: 1 } },
        { returnDocument: 'before' },
    ).lean();
}

/** Handles one message posted in the counting channel. */
async function handleCountingMessage(message) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const state = await loadState(guildId);
    const verdict = evaluateCount(state, userId, message.content);

    if (verdict.kind === 'ignore') return;

    if (verdict.kind === 'late') {
        await message.delete().catch(() => {});
        await postTempNotice(message.channel, `<@${userId}>, **${verdict.number}** was already counted.`, 4000);
        return;
    }

    if (verdict.kind === 'repeat') {
        await message.react('❌').catch(() => {});
        await postTempNotice(message.channel, `<@${userId}>, you can't count twice in a row. The count is still at **${state.current}**.`);
        return;
    }

    if (verdict.kind === 'wrong') {
        const before = await resetCount(guildId);
        await message.react('❌').catch(() => {});
        const lost = before ? before.current : state.current;
        const summary = lost > 0
            ? `<@${userId}> ruined it at **${lost}**. Best run is **${state.highScore}**.`
            : `<@${userId}> the count starts at **1**.`;
        await message.channel.send({
            content: `${summary} Next number is **1**.`,
            allowedMentions: { users: [userId] },
        }).catch(() => {});
        return;
    }

    // The condition makes this atomic. Two members posting the same next number
    // both pass the checks above, and only the first update matches.
    const updated = await Counting.findOneAndUpdate(
        { guildId, current: verdict.number - 1, lastUserId: { $ne: userId } },
        { $set: { current: verdict.number, lastUserId: userId }, $max: { highScore: verdict.number } },
        { returnDocument: 'after' },
    ).lean();

    if (!updated) {
        await message.delete().catch(() => {});
        return;
    }

    await message.react('✅').catch(err => logger.warn(`[COUNTING] Could not react in ${guildId}: ${err.message}`));
    if (verdict.number % MILESTONE_EVERY === 0) {
        await message.channel.send(`**${verdict.number}!** Keep it going.`).catch(() => {});
    }
}

module.exports = { evaluateCount, handleCountingMessage, MILESTONE_EVERY };
