const mongoose = require('mongoose');

// One moderation action taken against a member. Kept as an append-only log so
// mods can review history (/infractions) and the mod-log channel stays in sync.
const infractionSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    moderatorId: { type: String, required: true },
    type: { type: String, required: true, enum: ['warn', 'timeout', 'kick', 'ban'] },
    reason: { type: String, default: 'No reason provided' },
    durationMs: { type: Number, default: null }, // timeouts only
}, { timestamps: true });

// Fast lookups of a single member's history within a guild.
infractionSchema.index({ guildId: 1, userId: 1, createdAt: -1 });

module.exports = mongoose.model('Infraction', infractionSchema);
