const mongoose = require('mongoose');
const config = require('../../config.json');

const rewardRoleSchema = new mongoose.Schema({
    level: { type: Number, required: true },
    roleId: { type: String, required: true }
}, { _id: false });

const guildConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    xpEnabled: { type: Boolean, default: true },
    voiceXpEnabled: { type: Boolean, default: true },
    lfgChannelId: { type: String, default: null },
    announcementsChannelId: { type: String, default: null },
    levelUpLogChannelId: { type: String, default: null },
    cardStyle: { type: String, default: 'default' },
    minBaseXp: { type: Number, default: config.xpSettings.minBaseXp },
    maxBaseXp: { type: Number, default: config.xpSettings.maxBaseXp },
    lengthMultiplier: { type: Number, default: config.xpSettings.lengthMultiplier },
    maxTextXpPerMessage: { type: Number, default: config.xpSettings.maxTextXpPerMessage },
    textCooldownSeconds: { type: Number, default: config.xpSettings.textCooldownSeconds },
    voiceXpPerTick: { type: Number, default: config.xpSettings.voiceXpPerTick },
    voiceTickMinutes: { type: Number, default: config.xpSettings.voiceTickMinutes },
    levelRewardRoles: { type: [rewardRoleSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('GuildConfig', guildConfigSchema);
