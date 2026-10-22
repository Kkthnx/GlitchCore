/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { REST, Routes } = require('discord.js');
const logger = require('./logger');
const config = require('../../config.json');
const BotState = require('../database/BotStateSchema');

const REGISTER_MIN_INTERVAL_MS = (config.tuning && config.tuning.commandRegisterMinIntervalMs) || 60 * 60 * 1000;

/**
 * Registers all loaded slash commands to the configured guild. Called on
 * startup (see events/ready.js) so commands are always in sync with the code ,
 * no need to remember `npm run deploy`. Guild commands update instantly.
 */
async function registerGuildCommands(client) {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
        logger.warn('[DEPLOY] GUILD_ID not set, skipping auto command registration.');
        return;
    }

    // Skip when a recent boot already registered. In a crash loop, shard 0
    // respawning every minute would burn the command-registration rate limit
    // and slow recovery; the timestamp persists across restarts in BotState.
    try {
        const state = await BotState.findOne({ guildId }, { lastCommandRegisterAt: 1 }).lean();
        const last = state && state.lastCommandRegisterAt
            ? new Date(state.lastCommandRegisterAt).getTime()
            : 0;
        if (Date.now() - last < REGISTER_MIN_INTERVAL_MS) {
            logger.info(`[DEPLOY] Commands registered ${Math.round((Date.now() - last) / 60000)}m ago, skipping re-register.`);
            return;
        }
    } catch (err) {
        logger.warn('[DEPLOY] Could not read last registration time, registering anyway:', err.message);
    }

    const body = [...client.commands.values()].map(cmd => cmd.data.toJSON());
    const clientId = process.env.CLIENT_ID || client.user.id;
    const rest = new REST().setToken(process.env.TOKEN);

    try {
        const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
        logger.info(`[DEPLOY] Auto-registered ${data.length} guild command(s).`);
        await BotState.findOneAndUpdate(
            { guildId },
            { lastCommandRegisterAt: new Date() },
            { upsert: true }
        ).catch(err => logger.warn('[DEPLOY] Could not record registration time:', err.message));
    } catch (err) {
        logger.error('[DEPLOY] Auto command registration failed:', err);
    }
}

module.exports = { registerGuildCommands };
