/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const channels = require('./channels');
const { heldCount, takeHeldMembers } = require('./raidMode');
const logger = require('./logger');

/**
 * Gives the auto-role to every member held during raid mode who is still in the
 * server. Banned or departed raiders fail the member lookup and are skipped, so
 * running /massban first and releasing second leaves only the genuine joiners.
 *
 * Nothing is forgotten unless the role exists, so a missing auto-role config
 * doesn't throw away the list.
 *
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<{ released: number, gone: number, failed: number, noRole: boolean }>}
 */
async function releaseHeldMembers(guild) {
    const role = channels.roles.member && guild.roles.cache.get(channels.roles.member);
    if (!role) return { released: 0, gone: 0, failed: 0, noRole: true, waiting: heldCount(guild.id) };

    const ids = takeHeldMembers(guild.id);
    let released = 0;
    let gone = 0;
    let failed = 0;

    for (const id of ids) {
        const member = await guild.members.fetch(id).catch(() => null);
        if (!member) {
            gone += 1;
            continue;
        }
        try {
            await member.roles.add(role, 'Released from raid mode hold');
            released += 1;
        } catch (err) {
            failed += 1;
            logger.warn(`[RAID] Could not release ${id} in ${guild.id}: ${err.message}`);
        }
    }

    return { released, gone, failed, noRole: false, waiting: 0 };
}

module.exports = { releaseHeldMembers };
