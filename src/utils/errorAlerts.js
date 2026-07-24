const TransportStream = require('winston-transport');
const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');

// A winston transport that forwards error-level logs to a Discord channel, so
// problems surface where you'll see them instead of only in the console.
// Throttled to avoid spamming the channel during an error storm.
class DiscordErrorTransport extends TransportStream {
    constructor(opts) {
        super(opts);
        this.client = opts.client;
        this.channelId = opts.channelId;
        this.lastSent = 0;
        this.throttleMs = opts.throttleMs ?? 5000;
    }

    log(info, callback) {
        setImmediate(() => this.emit('logged', info));

        if (info.level === 'error') {
            const now = Date.now();
            if (now - this.lastSent >= this.throttleMs) {
                this.lastSent = now;
                const channel = this.client.channels.cache.get(this.channelId);
                if (channel) {
                    const body = String(info.stack || info.message || 'Unknown error').slice(0, 1800);
                    const embed = new EmbedBuilder()
                        .setColor(0xff6b6b)
                        .setTitle('⚠️ Bot Error')
                        .setDescription('```\n' + body + '\n```')
                        .setFooter({ text: `Shard ${info.shard ?? 0}` })
                        .setTimestamp();
                    channel.send({ embeds: [embed] }).catch(() => { /* never let alerting throw */ });
                }
            }
        }
        callback();
    }
}

/**
 * Attaches the Discord error transport if ERROR_CHANNEL_ID is configured.
 */
function attachErrorAlerts(client) {
    const channelId = process.env.ERROR_CHANNEL_ID;
    if (!channelId) return;
    logger.add(new DiscordErrorTransport({ client, channelId, level: 'error' }));
    logger.info(`[ALERTS] Error alerts will be posted to channel ${channelId}.`);
}

module.exports = { attachErrorAlerts, DiscordErrorTransport };
