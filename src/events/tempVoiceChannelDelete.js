/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { getLobby, forgetLobby } = require('../utils/tempVoiceManager');

// A moderator deleting a lobby by hand must not leave its record behind.
module.exports = {
    name: 'channelDelete',
    async execute(channel) {
        if (getLobby(channel.id)) await forgetLobby(channel.id);
    },
};
