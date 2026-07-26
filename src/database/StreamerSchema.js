/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const mongoose = require('mongoose');

// A tracked Twitch streamer. The poller flips isLive and records the stream id
// so a single live session is announced exactly once (a new id = a new stream).
const streamerSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    twitchLogin: { type: String, required: true },      // lowercase login
    twitchDisplayName: { type: String, required: true },
    discordUserId: { type: String, default: null },     // optional link to a member

    isLive: { type: Boolean, default: false },
    lastStreamId: { type: String, default: null },

    // The live-announcement message, so it can be cleaned up when they go offline.
    liveMessageId: { type: String, default: null },
    liveChannelId: { type: String, default: null },
}, { timestamps: true });

streamerSchema.index({ guildId: 1, twitchLogin: 1 }, { unique: true });

module.exports = mongoose.model('Streamer', streamerSchema);
