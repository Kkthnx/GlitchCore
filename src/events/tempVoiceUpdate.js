/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { handleVoiceChange } = require('../utils/tempVoiceManager');

// Kept apart from voiceStateUpdate.js, which only deals with voice XP.
module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        await handleVoiceChange(oldState, newState);
    },
};
