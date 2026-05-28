const mongoose = require('mongoose');

// A single document that stores persistent bot-wide state flags.
// We use guildId as the key so this scales to multi-server use later.
const botStateSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },

    // Stores the calendar date string (YYYY-MM-DD) of the last double XP announcement.
    // We compare this to today's date on startup to avoid re-announcing on restart.
    lastDoubleXpDate: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('BotState', botStateSchema);
