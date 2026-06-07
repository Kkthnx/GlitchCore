require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Options } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

// ---------------------------------------------------------------------------
// Global error handlers — prevents the bot from dying on unhandled rejections
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
});

// 1. Initialize the Client with required Intents
//    Least privilege: every intent below maps to an active feature.
//    - MessageContent (privileged): text XP + auto-mod filter
//    - GuildMembers   (privileged): welcome banner + auto-role
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ],
    // Bound the largest caches so long uptimes can't grow unbounded (OOM guard).
    makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 50,                 // keep at most 50 messages per channel
        ReactionManager: 0,
        GuildInviteManager: 0,
    }),
    // Periodically reclaim memory from inactive cached objects.
    sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: {
            interval: 600,                  // every 10 minutes
            lifetime: 1800,                 // drop messages older than 30 minutes
        },
        users: {
            interval: 3600,                 // every hour
            filter: () => (user) => user.id !== client.user?.id,
        },
    },
});

// Client & Shard Error Handlers (prevents websocket disconnects from crashing)
client.on('error', err => logger.error('[CLIENT_ERROR]', err));
client.on('shardError', (err, shardId) => logger.error(`[SHARD_ERROR] Shard ${shardId} encountered an error:`, err));
client.on('warn', info => logger.warn(`[CLIENT_WARN] ${info}`));

// Create collections to store commands and cooldowns
client.commands = new Collection();
client.cooldowns = new Collection();

// Periodically clean up the cooldowns map to prevent memory leaks over long uptimes
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of client.cooldowns.entries()) {
        // Remove timestamps older than 1 hour
        if (now - timestamp > 60 * 60 * 1000) {
            client.cooldowns.delete(key);
        }
    }
}, 60 * 60 * 1000);

const { startXpSync } = require('./utils/xpCache');
const { startVoiceXpSync } = require('./events/voiceStateUpdate');

// 2. Connect to the Database
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        logger.info('Connected to MongoDB Atlas');
        startXpSync(client);
        startVoiceXpSync(client);
        logger.info('Background XP & Voice Sync started');
    })
    .catch((err) => logger.error('MongoDB Connection Error:', err));

// 3. Event Handler (loads .js files from src/events)
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
    }
}

// 4. Command Loader — only reads entries that are actually directories
const commandsPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(commandsPath)
    .filter(entry => fs.statSync(path.join(commandsPath, entry)).isDirectory());

for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            logger.warn(`[WARN] ${filePath} is missing "data" or "execute".`);
        }
    }
}

// 5. Log in to Discord
client.login(process.env.TOKEN)
    .then(() => logger.info('GlitchCore is online and running!'))
    .catch((err) => logger.error('Failed to login:', err));
