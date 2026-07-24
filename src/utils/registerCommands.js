const { REST, Routes } = require('discord.js');
const logger = require('./logger');

/**
 * Registers all loaded slash commands to the configured guild. Called on
 * startup (see events/ready.js) so commands are always in sync with the code —
 * no need to remember `npm run deploy`. Guild commands update instantly.
 */
async function registerGuildCommands(client) {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
        logger.warn('[DEPLOY] GUILD_ID not set — skipping auto command registration.');
        return;
    }

    const body = [...client.commands.values()].map(cmd => cmd.data.toJSON());
    const clientId = process.env.CLIENT_ID || client.user.id;
    const rest = new REST().setToken(process.env.TOKEN);

    try {
        const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
        logger.info(`[DEPLOY] Auto-registered ${data.length} guild command(s).`);
    } catch (err) {
        logger.error('[DEPLOY] Auto command registration failed:', err);
    }
}

module.exports = { registerGuildCommands };
