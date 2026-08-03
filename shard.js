/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

require('dotenv').config();
const { ShardingManager } = require('discord.js');
const path = require('path');

const manager = new ShardingManager(path.join(__dirname, 'src/index.js'), {
    token: process.env.TOKEN,
    // 'auto' lets Discord pick the shard count from guild size. Set a number to pin it.
    totalShards: 'auto',
    // Respawn a shard automatically if its process dies.
    respawn: true,
});

manager.on('shardCreate', shard => {
    console.log(`[SHARD] Launched shard ${shard.id}`);
    shard.on('ready', () => console.log(`[SHARD] Shard ${shard.id} is ready`));
    shard.on('disconnect', () => console.warn(`[SHARD] Shard ${shard.id} disconnected`));
    shard.on('reconnecting', () => console.log(`[SHARD] Shard ${shard.id} reconnecting`));
    shard.on('death', proc => console.error(`[SHARD] Shard ${shard.id} died (exit ${proc?.exitCode ?? '?'}), respawning`));
});

// On host stop, flush each shard's buffered XP before the process is killed.
// The child may not receive the signal directly, so we push the flush over the
// manager, then exit (which tears the shards down).
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
        console.log(`[SHARD] ${signal} received, flushing and shutting down`);
        try {
            await manager.broadcastEval(c => (c.flushXp ? c.flushXp() : null));
        } catch { /* shards may already be gone */ }
        process.exit(0);
    });
}

// Spawn with in-process backoff. Exiting on failure makes the host restart the
// container, which re-hits Discord's gateway and can escalate a temporary
// rate limit (HTTP 429) into a long crash-loop ban. Staying alive and retrying
// gently is always better than dying and being restarted.
const MIN_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000; // never sleep more than 15 minutes between tries

function backoffFor(err, attempt) {
    // Honor Retry-After (seconds) when Discord/Cloudflare sends one, capped so
    // we still re-check periodically instead of sleeping for hours.
    const retryAfter = Number(err?.headers?.get?.('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
        return Math.min(retryAfter * 1000, MAX_BACKOFF_MS);
    }
    const exp = MIN_BACKOFF_MS * Math.pow(2, Math.min(attempt, 5));
    return Math.min(exp, MAX_BACKOFF_MS);
}

async function spawnWithRetry() {
    let attempt = 0;
    for (;;) {
        try {
            const shards = await manager.spawn();
            console.log(`[SHARD] Spawned ${shards.size} shard(s)`);
            return;
        } catch (err) {
            attempt += 1;
            const status = err?.status ? ` (HTTP ${err.status})` : '';
            const waitMs = backoffFor(err, attempt);
            console.error(`[SHARD] Spawn attempt ${attempt} failed${status}, retrying in ${Math.round(waitMs / 1000)}s:`, err?.message || err);
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    }
}

spawnWithRetry();
