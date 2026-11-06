/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const mongoose = require('mongoose');

// State of the counting channel, one row per server.
const countingSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    current: { type: Number, default: 0 },
    lastUserId: { type: String, default: null },
    highScore: { type: Number, default: 0 },
    resets: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Counting', countingSchema);
