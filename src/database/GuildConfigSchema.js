const mongoose = require('mongoose');
const config = require('../../config.json');

const rewardRoleSchema = new mongoose.Schema({
    level: { type: Number, required: true },
    roleId: { type: String, required: true }
}, { _id: false });

// A role members can self-assign from the /roles menu (games they play,
// opt-in ping roles like @DoubleXP, regions, etc.).
const selfRoleSchema = new mongoose.Schema({
    roleId: { type: String, required: true },
    label: { type: String, required: true },
    emoji: { type: String, default: null },
    description: { type: String, default: null },
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

    // Self-assignable roles + the opt-in Double XP ping target.
    selfRoles: { type: [selfRoleSchema], default: [] },
    doubleXpRoleId: { type: String, default: null },

    // Moderation
    modLogChannelId: { type: String, default: null },
    antiSpamEnabled: { type: Boolean, default: config.moderation?.antiSpam?.enabled ?? true },
}, { timestamps: true });

module.exports = mongoose.model('GuildConfig', guildConfigSchema);
