/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const mongoose = require('mongoose');

const attendeeSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String, required: true },
}, { _id: false });

// A scheduled game-night. Members RSVP via buttons; at start time the going
// roster is pinged. Capacity>0 enables an auto-promoting waitlist.
const eventSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    hostId: { type: String, required: true },

    game: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    startsAt: { type: Date, required: true },
    capacity: { type: Number, default: 0 }, // 0 = unlimited
    imgUrl: { type: String, default: null }, // SteamGridDB banner
    bannerFile: { type: String, default: null }, // bundled banner filename, overrides imgUrl

    pingRoleId: { type: String, default: null },

    going: { type: [attendeeSchema], default: [] },
    maybe: { type: [attendeeSchema], default: [] },
    waitlist: { type: [attendeeSchema], default: [] },

    status: { type: String, enum: ['SCHEDULED', 'STARTED', 'CANCELLED'], default: 'SCHEDULED' },
    startNotified: { type: Boolean, default: false },

    // 'weekly' re-posts a fresh copy 7 days out when this one starts; 'none'
    // is a one-off. spawnedNext guards against cloning the same event twice.
    recurrence: { type: String, enum: ['none', 'weekly'], default: 'none' },
    spawnedNext: { type: Boolean, default: false },
}, { timestamps: true });

// Scheduler query: find SCHEDULED events whose start time has passed.
eventSchema.index({ status: 1, startNotified: 1, startsAt: 1 });

module.exports = mongoose.model('Event', eventSchema);
