/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Lightweight in-memory AFK tracking (cleared on restart — acceptable for AFK).
const afk = new Map(); // `${guildId}-${userId}` -> { reason, since }

const key = (g, u) => `${g}-${u}`;

function setAfk(guildId, userId, reason) {
    afk.set(key(guildId, userId), { reason: reason || 'AFK', since: Date.now() });
}
function clearAfk(guildId, userId) {
    const k = key(guildId, userId);
    const value = afk.get(k);
    afk.delete(k);
    return value;
}
function getAfk(guildId, userId) {
    return afk.get(key(guildId, userId));
}

module.exports = { setAfk, clearAfk, getAfk };
