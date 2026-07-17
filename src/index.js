require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Options } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

// ---------------------------------------------------------------------------
// Global error handlers — prevents the bot from dying on unhandled rejections
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection:', { reason, promise });
});
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
});

// 1. Initialize the Client with required Intents
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

// 2. Connect to the Database with Automatic Reconnect & Exponential Backoff
// Note: Background XP loops are safely managed within events/ready.js 
// to guarantee Discord guild caches are loaded before data aggregation hooks begin.
let mongoRetryCount = 0;
const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_DELAY = 1000; // 1 second

function connectMongo() {
    mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        retryWrites: true,
    })
        .then(() => {
            logger.info('Connected to MongoDB Atlas');
            mongoRetryCount = 0; // Reset on successful connection
        })
        .catch((err) => {
            logger.error('MongoDB Connection Error:', err.message);

            if (mongoRetryCount < MAX_RETRY_ATTEMPTS) {
                mongoRetryCount += 1;
                const delayMs = BASE_RETRY_DELAY * Math.pow(2, mongoRetryCount - 1);
                logger.warn(`Retrying MongoDB connection in ${delayMs}ms (attempt ${mongoRetryCount}/${MAX_RETRY_ATTEMPTS})...`);
                setTimeout(connectMongo, delayMs);
            } else {
                logger.error('MongoDB connection failed after maximum retries. Bot will continue without DB.');
            }
        });
}

connectMongo();

// Listen for connection events to detect and handle disconnects
mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB connection lost. Attempting to reconnect...');
    mongoRetryCount = 0;
    setTimeout(connectMongo, BASE_RETRY_DELAY);
});

mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error:', err.message);
});

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

// 4. Command Loader — recursively load all command files
const commandsPath = path.join(__dirname, 'commands');

function loadCommandFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            loadCommandFiles(fullPath);
            continue;
        }

        if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
        const command = require(fullPath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            logger.warn(`[WARN] ${fullPath} is missing "data" or "execute".`);
        }
    }
}

loadCommandFiles(commandsPath);

// 5. Log in to Discord
client.login(process.env.TOKEN)
    .then(() => logger.info('GlitchCore is online and running!'))
    .catch((err) => logger.error('Failed to login:', err));