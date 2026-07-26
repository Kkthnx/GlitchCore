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

manager.spawn()
    .then(shards => console.log(`[SHARD] Spawned ${shards.size} shard(s)`))
    .catch(err => {
        console.error('[SHARD] Failed to spawn shards:', err);
        process.exit(1);
    });
