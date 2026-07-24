const mongoose = require('mongoose');

// A community suggestion posted to the suggestion board. Members up/down-vote
// via buttons; managers approve or deny.
const suggestionSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    authorId: { type: String, required: true },
    text: { type: String, required: true },

    upvotes: { type: [String], default: [] },
    downvotes: { type: [String], default: [] },
    status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('Suggestion', suggestionSchema);
