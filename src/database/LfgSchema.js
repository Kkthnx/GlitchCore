/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const mongoose = require('mongoose');

// Subdocument for each roster member, no auto _id needed
const rosterMemberSchema = new mongoose.Schema({
    userId:   { type: String, required: true },
    username: { type: String, required: true },
}, { _id: false });

const lfgSchema = new mongoose.Schema({
    messageId:  { type: String, required: true, unique: true },
    channelId:  { type: String, required: true },
    guildId:    { type: String, required: true },
    hostId:     { type: String, required: true },
    game:       { type: String, required: true },
    activity:   { type: String, required: true },
    totalSlots: { type: Number, required: true, min: 2, max: 10 },
    imgUrl:     { type: String, default: null },
    roster:     { type: [rosterMemberSchema], default: [] },
    waitlist:   { type: [rosterMemberSchema], default: [] },
    status:     { type: String, enum: ['OPEN', 'LOCKED', 'CANCELLED'], default: 'OPEN' },
}, { timestamps: true });

// Index for the stale-session cleanup query: OPEN sessions in this shard's
// guilds inactive for 1h. Without the guildId prefix, cleanUpStaleLfgSessions
// does a full collection scan every 30 minutes.
// (Button clicks query by messageId, which is already indexed via unique:true.)
lfgSchema.index({ guildId: 1, status: 1, updatedAt: 1 });

module.exports = mongoose.model('LfgSession', lfgSchema);
