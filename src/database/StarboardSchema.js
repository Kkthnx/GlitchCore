const mongoose = require('mongoose');

// Maps an original message to its posted starboard entry so the count can be
// updated in place and the same message is never starred twice.
const starboardSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    originMessageId: { type: String, required: true, unique: true },
    originChannelId: { type: String, required: true },
    starboardMessageId: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Starboard', starboardSchema);
