/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

require('dotenv').config();
const { ShardingManager } = require('discord.js');
const path = require('path');

// Initialize the Sharding Manager pointing to the main bot entry file
const manager = new ShardingManager(path.join(__dirname, 'src/index.js'), {
    token: process.env.TOKEN,
    // By default, 'auto' will spawn the amount of shards Discord suggests based on guild count.
    // If you explicitly want a specific amount of shards, change 'auto' to a number (e.g. 2).
    totalShards: 'auto'
});

// Track reconnection attempts to implement backoff
const reconnectAttempts = new Map();
const BASE_RECONNECT_DELAY = 5000; // 5 seconds
const MAX_RECONNECT_DELAY = 60000; // 60 seconds

// Event listener for when a shard is successfully spawned
manager.on('shardCreate', shard => {
    console.log(`[SHARDING_MANAGER] Launched Shard ${shard.id}`);
    reconnectAttempts.set(shard.id, 0);

    shard.on('ready', () => {
        console.log(`[SHARD_READY] Shard ${shard.id} is ready!`);
        reconnectAttempts.set(shard.id, 0); // Reset on success
    });

    shard.on('disconnect', () => {
        console.log(`[SHARD_DISCONNECT] Shard ${shard.id} disconnected.`);
    });

    shard.on('reconnecting', () => {
        const attempts = reconnectAttempts.get(shard.id) || 0;
        console.log(`[SHARD_RECONNECT] Shard ${shard.id} is reconnecting... (attempt ${attempts + 1})`);
    });

    shard.on('death', (process) => {
        console.error(`[SHARD_DEATH] Shard ${shard.id} died unexpectedly! Exit code: ${process.exitCode}`);

        // Implement exponential backoff on repeated deaths
        const attempts = reconnectAttempts.get(shard.id) || 0;
        const nextAttempt = attempts + 1;
        const delayMs = Math.min(BASE_RECONNECT_DELAY * Math.pow(1.5, nextAttempt), MAX_RECONNECT_DELAY);

        reconnectAttempts.set(shard.id, nextAttempt);
        console.warn(`[SHARD_BACKOFF] Shard ${shard.id} will retry in ${delayMs}ms (attempt ${nextAttempt})`);
    });
});

// Start spawning shards
manager.spawn()
    .then(shards => {
        console.log(`[SHARDING_MANAGER] Successfully spawned ${shards.size} shard(s).`);
    })
    .catch(err => {
        console.error(`[SHARDING_MANAGER_ERROR] Failed to spawn shards:`, err);
        process.exit(1);
    });
