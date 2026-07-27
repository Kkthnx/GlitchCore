/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const BANNER_DIR = path.join(__dirname, '../assets/banners');

// Bundled banners a host can attach to an event. Keys are the slash-command
// choice values; each has the file in src/assets/banners plus a clean default
// blurb used when the host doesn't supply their own description.
const BANNERS = {
    'friday-night-gaming': {
        file: 'friday-night-gaming.png',
        blurb: 'Kick off the weekend with the crew. Hop in, pick a game, and let the good times roll.',
    },
    'saturday-night-gaming': {
        file: 'saturday-night-gaming.png',
        blurb: 'Round two, Saturday night. Squad up, queue in, and bring the chaos.',
    },
};

// Slash-command choices for the banner option.
const BANNER_CHOICES = Object.keys(BANNERS).map(k => ({ name: k, value: k }));

// The stored filename for a banner key, or null if unknown.
function bannerFileForKey(key) {
    return BANNERS[key]?.file || null;
}

// The default description for a banner key, or null if unknown.
function bannerBlurbForKey(key) {
    return BANNERS[key]?.blurb || null;
}

// Returns a fresh AttachmentBuilder for a stored banner filename, or null if
// the file is missing (so a bad reference degrades to no image, not a crash).
function bannerAttachment(bannerFile) {
    if (!bannerFile) return null;
    const full = path.join(BANNER_DIR, bannerFile);
    if (!fs.existsSync(full)) return null;
    return new AttachmentBuilder(full, { name: bannerFile });
}

module.exports = { BANNERS, BANNER_CHOICES, bannerFileForKey, bannerBlurbForKey, bannerAttachment };
