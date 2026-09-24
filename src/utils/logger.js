/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { createLogger, format, transports } = require('winston');

// Pull the shard id (set by discord.js ShardingManager) so distributed logs
// can be traced back to the process that produced them.
const shardId = process.env.SHARDS ?? process.env.SHARD_ID ?? '0';

// Mask the bot token (and other obvious secrets) in any logged string so it
// can never leak to stdout, files, or an external log aggregator.
const redactSecrets = format((info) => {
    // Every credential the bot holds. A Twitch token error, for example, can
    // echo the request body straight back into the log line.
    const secrets = [
        [process.env.TOKEN, '[REDACTED_TOKEN]'],
        [process.env.MONGO_URI, '[REDACTED_MONGO_URI]'],
        [process.env.STEAMGRIDDB_API_KEY, '[REDACTED_API_KEY]'],
        [process.env.TWITCH_CLIENT_SECRET, '[REDACTED_TWITCH_SECRET]'],
    ];

    const scrub = (value) => {
        if (typeof value !== 'string') return value;
        let out = value;
        for (const [secret, mask] of secrets) {
            if (secret) out = out.split(secret).join(mask);
        }
        return out;
    };

    info.message = scrub(info.message);
    if (info.stack) info.stack = scrub(info.stack);
    return info;
});

const isProduction = process.env.NODE_ENV === 'production';

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { shard: shardId },
    format: format.combine(
        redactSecrets(),
        format.timestamp(),
        format.errors({ stack: true }),
        // JSON in production for log aggregators; human-readable locally.
        isProduction
            ? format.json()
            : format.printf(({ level, message, timestamp, stack, shard }) =>
                `${timestamp} [shard:${shard}] ${level}: ${stack || message}`)
    ),
    transports: [new transports.Console()],
});

module.exports = logger;
