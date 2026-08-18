/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getProfile, overviewStats } = require('../utils/trackerClient');

// Game and platform slugs are centralized so they are trivial to adjust when
// Tracker.gg finalizes Battlefield 6 support.
const GAME = 'bf6';
const PLATFORMS = [
    { name: 'PC', value: 'origin' },
    { name: 'PlayStation', value: 'psn' },
    { name: 'Xbox', value: 'xbl' },
];

// Stats we surface first, if the profile has them. Anything else fills in after,
// so the card still renders even if Battlefield 6 uses different keys.
const PREFERRED = [
    'rank', 'level', 'kills', 'deaths', 'kdRatio', 'kdr',
    'wins', 'wlPercentage', 'winPct', 'matchesPlayed',
    'scorePerMinute', 'spm', 'killsPerMinute', 'kpm',
    'headshots', 'timePlayed', 'score',
];
const MAX_STATS = 12;
const LABEL_W = 16;

const PALETTE = 0x39ff14;
const ESC = '\x1b';
const G = `${ESC}[1;32m`;
const C = `${ESC}[1;36m`;
const W = `${ESC}[1;37m`;
const RST = `${ESC}[0m`;

const ERRORS = {
    no_key: 'Battlefield stats are not configured yet. An admin needs to set a Tracker.gg API key.',
    not_found: 'No profile found. Check the platform and exact in-game name.',
    private: 'That profile is set to private on Tracker.gg.',
    auth: 'The Tracker.gg API key is missing or invalid.',
    rate_limited: 'Tracker.gg is rate limiting us right now. Try again in a minute.',
    network: 'Could not reach Tracker.gg. Try again shortly.',
    unavailable: 'Battlefield 6 stats are not available from Tracker.gg yet.',
};

// Build the aligned ANSI stat readout from the overview stats map.
function buildStatsBlock(stats) {
    const seen = new Set();
    const ordered = [];
    for (const key of PREFERRED) {
        if (stats[key] && !seen.has(key)) { ordered.push(key); seen.add(key); }
    }
    for (const key of Object.keys(stats)) {
        if (ordered.length >= MAX_STATS) break;
        if (!seen.has(key)) { ordered.push(key); seen.add(key); }
    }

    const rows = ordered.slice(0, MAX_STATS).map(key => {
        const s = stats[key];
        const label = String(s.displayName || key).slice(0, LABEL_W).padEnd(LABEL_W);
        const value = String(s.displayValue ?? s.value ?? '-');
        return `${C}${label}${RST} ${W}${value}${RST}`;
    });

    return ['```ansi', `${G}> DECRYPTING COMBAT RECORD...${RST}`, '', ...rows, '```'].join('\n');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bf6')
        .setDescription('Look up Battlefield 6 player stats from Tracker.gg')
        .setDMPermission(false)
        .addStringOption(o => o.setName('platform').setDescription('Player platform').setRequired(true)
            .addChoices(...PLATFORMS))
        .addStringOption(o => o.setName('username').setDescription('In-game name / ID').setRequired(true).setMaxLength(64)),

    async execute(interaction) {
        await interaction.deferReply();
        const platform = interaction.options.getString('platform');
        const username = interaction.options.getString('username').trim();

        const result = await getProfile(GAME, platform, username);
        if (result.error) {
            return interaction.editReply({ content: `\`BF6_ERR\` ${ERRORS[result.error] || ERRORS.unavailable}`, flags: MessageFlags.Ephemeral });
        }

        const data = result.data;
        const stats = overviewStats(data);
        if (!Object.keys(stats).length) {
            return interaction.editReply({ content: '`BF6_ERR` That profile has no stats to show yet.' });
        }

        const handle = data.platformInfo?.platformUserHandle || username;
        const avatar = data.platformInfo?.avatarUrl || null;
        const profileUrl = `https://tracker.gg/${GAME}/profile/${platform}/${encodeURIComponent(username)}/overview`;

        const embed = new EmbedBuilder()
            .setColor(PALETTE)
            .setAuthor({ name: '⚡ SYSTEM.BF6' })
            .setTitle(`> ${handle}`)
            .setURL(profileUrl)
            .setDescription(buildStatsBlock(stats))
            .setFooter({ text: 'GLITCH_HAVEN // TRACKER.GG' })
            .setTimestamp();
        if (avatar) embed.setThumbnail(avatar);

        await interaction.editReply({ embeds: [embed] });
    },
};
