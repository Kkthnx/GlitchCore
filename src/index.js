require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Global error handlers — prevents the bot from dying on unhandled rejections
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

// 1. Initialize the Client with required Intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,  // Required to read text for XP
        GatewayIntentBits.GuildMembers,    // Required for Welcome/Goodbye events
        GatewayIntentBits.GuildVoiceStates, // Required for Voice XP
        GatewayIntentBits.GuildPresences   // Required for streaming announcements
    ]
});

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

// 2. Connect to the Database
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB Atlas');
        startXpSync(client);
        console.log('✅ Background XP Sync started');
    })
    .catch((err) => console.error('❌ MongoDB Connection Error:', err));

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
            console.warn(`[WARN] ${filePath} is missing "data" or "execute".`);
        }
    }
}

// 5. Log in to Discord
client.login(process.env.TOKEN)
    .then(() => console.log('✅ GlitchCore is online and running!'))
    .catch((err) => console.error('❌ Failed to login:', err));