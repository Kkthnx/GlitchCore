/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

require('dotenv').config({ quiet: true });
const { ShardingManager } = require('discord.js');
const path = require('path');
const { backoffFor, describeSpawnError } = require('./src/utils/spawnBackoff');

// Fail here with a clear message. A shard that exits on a missing variable
// would just be respawned into the same failure.
const missingEnv = ['TOKEN', 'MONGO_URI'].filter(name => !process.env[name]);
if (missingEnv.length > 0) {
    console.error(`[SHARD] Missing required environment variable(s): ${missingEnv.join(', ')}. Copy .env.example to .env and fill them in.`);
    process.exit(1);
}

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
// gently is always better than dying and being restarted. A long Retry-After
// means an IP block, and the full wait is honored (see utils/spawnBackoff.js).
async function spawnWithRetry() {
    let attempt = 0;
    for (;;) {
        try {
            const shards = await manager.spawn();
            console.log(`[SHARD] Spawned ${shards.size} shard(s)`);
            return;
        } catch (err) {
            attempt += 1;
            const waitMs = backoffFor(err, attempt);
            console.error(`[SHARD] Spawn attempt ${attempt} failed (${describeSpawnError(err)}), retrying in ${Math.round(waitMs / 60000)} min.`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    }
}

spawnWithRetry();
