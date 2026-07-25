const mongoose = require('mongoose');

// A scheduled reminder. The poller fires it at remindAt, pings the user in the
// original channel (DM fallback), then deletes it.
const reminderSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    message: { type: String, required: true },
    remindAt: { type: Date, required: true },
}, { timestamps: true });

reminderSchema.index({ remindAt: 1 });

module.exports = mongoose.model('Reminder', reminderSchema);
