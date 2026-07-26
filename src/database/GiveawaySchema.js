/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const mongoose = require('mongoose');

// A button-entry giveaway. The scheduler ends it at endsAt, draws winners from
// entries, and announces them. Reroll picks fresh winners from the same pool.
const giveawaySchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    hostId: { type: String, required: true },

    prize: { type: String, required: true },
    winnerCount: { type: Number, default: 1, min: 1 },
    endsAt: { type: Date, required: true },

    entries: { type: [String], default: [] },
    ended: { type: Boolean, default: false },
    winners: { type: [String], default: [] },
}, { timestamps: true });

// Scheduler query: find live giveaways whose time is up.
giveawaySchema.index({ ended: 1, endsAt: 1 });

module.exports = mongoose.model('Giveaway', giveawaySchema);
