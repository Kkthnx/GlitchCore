/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const mongoose = require('mongoose');

// A pending timed ban. The scheduler unbans the user once unbanAt passes.
const tempBanSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    unbanAt: { type: Date, required: true },
    reason: { type: String, default: null },
}, { timestamps: true });

tempBanSchema.index({ guildId: 1, userId: 1 }, { unique: true });
tempBanSchema.index({ unbanAt: 1 });

module.exports = mongoose.model('TempBan', tempBanSchema);
