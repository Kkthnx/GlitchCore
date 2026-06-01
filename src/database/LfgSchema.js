const mongoose = require('mongoose');

// Subdocument for each roster member — no auto _id needed
const rosterMemberSchema = new mongoose.Schema({
    userId:   { type: String, required: true },
    username: { type: String, required: true },
}, { _id: false });

const lfgSchema = new mongoose.Schema({
    messageId:  { type: String, required: true, unique: true },
    channelId:  { type: String, required: true },
    guildId:    { type: String, required: true },
    hostId:     { type: String, required: true },
    game:       { type: String, required: true },
    activity:   { type: String, required: true },
    totalSlots: { type: Number, required: true, min: 2, max: 10 },
    roster:     { type: [rosterMemberSchema], default: [] },
    status:     { type: String, enum: ['OPEN', 'LOCKED'], default: 'OPEN' },
}, { timestamps: true });

// Index for the stale-session cleanup query: find OPEN sessions older than 24h.
// Without this, cleanUpStaleLfgSessions does a full collection scan every 30 minutes.
lfgSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('LfgSession', lfgSchema);
