/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const mongoose = require('mongoose');

// A reusable canned response (FAQ answer, rules blurb, etc.) recalled by name.
const tagSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    name: { type: String, required: true },
    content: { type: String, required: true },
    authorId: { type: String, required: true },
    uses: { type: Number, default: 0 },
}, { timestamps: true });

tagSchema.index({ guildId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Tag', tagSchema);
