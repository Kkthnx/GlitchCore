/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const mongoose = require('mongoose');

// One row per temporary voice channel the bot created. Kept in the database so
// a restart can find and clean up lobbies that emptied while the bot was down.
const tempVoiceSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true },
}, { timestamps: true });

tempVoiceSchema.index({ guildId: 1 });

module.exports = mongoose.model('TempVoice', tempVoiceSchema);
