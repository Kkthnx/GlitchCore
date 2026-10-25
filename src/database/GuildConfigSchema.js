/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

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
    lfgPingRoleId: { type: String, default: null },
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
    // The word/content filter. Was previously unconditional, with no way to turn
    // it off per server, which made it the only moderation feature without a switch.
    contentFilterEnabled: { type: Boolean, default: true },

    // Account-age gating. Joins from accounts younger than minAccountAgeDays
    // get flagged in the mod-log (ban evasion usually runs on fresh alts), and
    // when newAccountHoldMinutes is set they're also timed out for that long.
    // 0 days disables the check entirely.
    minAccountAgeDays: { type: Number, default: 7 },
    newAccountHoldMinutes: { type: Number, default: 0 },

    // Channel IDs where the CJK filter doesn't apply (e.g. an international
    // chat). Empty means no exemptions.
    cjkExemptChannelIds: { type: [String], default: [] },

    // Strike escalation: collecting strikeWarnThreshold warns inside
    // strikeWindowDays automatically triggers strikeAction (timeout, kick or
    // ban). Threshold 0 disables it.
    strikeWarnThreshold: { type: Number, default: 3 },
    strikeWindowDays: { type: Number, default: 30 },
    strikeAction: { type: String, default: 'timeout' },
    strikeTimeoutMinutes: { type: Number, default: 60 },
    // Off by default: only moderator warns count toward strikes. When on, the
    // warns auto-mod issues (filter hits, invites, scam links) count too, so a
    // repeat offender escalates without a moderator having to be around.
    autoModStrikes: { type: Boolean, default: false },

    // Master switch for the audit log posted to the mod-log channel. Nothing is
    // stored, this only decides whether entries are posted.
    auditLogEnabled: { type: Boolean, default: true },

    // Starboard, repost highly-reacted messages to a highlights channel.
    starboardChannelId: { type: String, default: null },
    starboardThreshold: { type: Number, default: 3 },
    starboardEmoji: { type: String, default: '⭐' },

    // Streamer go-live announcements.
    streamerChannelId: { type: String, default: null },
    streamerPingRoleId: { type: String, default: null },

    // Suggestion board channel.
    suggestionChannelId: { type: String, default: null },

    // Automated milestone level-roles (e.g. a role every 10 levels up to 1000).
    // interval 0 = disabled. Roles are created on demand and named from the
    // template ({level} is substituted). stack=false keeps only the highest.
    levelRoleInterval: { type: Number, default: 0 },
    levelRoleMax: { type: Number, default: config.xpSettings.maxLevel || 1000 },
    levelRoleTemplate: { type: String, default: 'Level {level}' },
    levelRoleStack: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('GuildConfig', guildConfigSchema);
