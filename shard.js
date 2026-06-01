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

// Event listener for when a shard is successfully spawned
manager.on('shardCreate', shard => {
    console.log(`[SHARDING_MANAGER] Launched Shard ${shard.id}`);
    
    shard.on('ready', () => {
        console.log(`[SHARD_READY] Shard ${shard.id} is ready!`);
    });
    
    shard.on('disconnect', () => {
        console.log(`[SHARD_DISCONNECT] Shard ${shard.id} disconnected.`);
    });
    
    shard.on('reconnecting', () => {
        console.log(`[SHARD_RECONNECT] Shard ${shard.id} is reconnecting...`);
    });
    
    shard.on('death', (process) => {
        console.error(`[SHARD_DEATH] Shard ${shard.id} died unexpectedly! Exit code: ${process.exitCode}`);
    });
});

// Start spawning shards
manager.spawn()
    .then(shards => {
        console.log(`[SHARDING_MANAGER] Successfully spawned ${shards.size} shard(s).`);
    })
    .catch(console.error);
