require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { fetchAndPostNews } = require('./src/utils/newsChecker.js');
const mongoose = require('mongoose');
const BotState = require('./src/database/BotStateSchema');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log('Bot is ready, connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected. Forcing a test post by temporarily removing the latest hash...');

    let botState = await BotState.findOne({ guildId: 'global' });
    if (botState && botState.postedNews.length > 0) {
        botState.postedNews.pop();
        await botState.save();
    }

    console.log('Running news checker...');
    await fetchAndPostNews(client);
    
    console.log('Test complete. Shutting down test script.');
    process.exit(0);
});

client.login(process.env.TOKEN);
