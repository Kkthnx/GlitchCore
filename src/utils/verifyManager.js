/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getGuildConfig } = require('./guildConfigCache');
const { isRaidMode } = require('./raidMode');
const { brandedEmbed, COLORS } = require('./brand');
const logger = require('./logger');

const VERIFY_ID = 'verify:accept';

const DEFAULT_RULES = [
    'You are 18 or older.',
    'Be decent. No harassment, slurs or hate.',
    'No cheating, boosting for pay, or account trading.',
    'Keep NSFW content to the channels made for it.',
    'Staff have the final say.',
].map((line, i) => `**${i + 1}.** ${line}`).join('\n');

/** The post members click to verify. */
function buildGatePanel(rulesText) {
    const embed = brandedEmbed({ color: COLORS.primary, footer: 'Glitch Haven, Verification' })
        .setAuthor({ name: 'SYSTEM.ACCESS_CHECK' })
        .setTitle('> VERIFY TO ENTER')
        .setDescription(`${rulesText || DEFAULT_RULES}\n\nHit the button below to confirm you are 18+ and agree to the rules.`);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(VERIFY_ID).setLabel("I'm 18+ and I agree").setStyle(ButtonStyle.Success),
    );
    return { embeds: [embed], components: [row] };
}

/**
 * Decides what a click on the verify button should do. Pure so every branch can
 * be tested without a Discord client.
 * @returns {{ ok: boolean, message: string }}
 */
function evaluateVerify({ roleExists, hasRole, raidMode, botCanAssign }) {
    if (!roleExists) return { ok: false, message: 'Verification is not set up properly yet. Ping a mod.' };
    if (hasRole) return { ok: false, message: 'You are already verified.' };
    if (raidMode) return { ok: false, message: 'Verification is paused while staff deal with a raid. Try again in a few minutes.' };
    if (!botCanAssign) return { ok: false, message: 'I cannot hand out that role right now. Ping a mod.' };
    return { ok: true, message: 'You are in. Welcome to Glitch Haven.' };
}

async function handleVerifyButton(interaction) {
    const { guild, member } = interaction;
    const cfg = await getGuildConfig(guild.id) || {};
    const role = cfg.verifyRoleId ? guild.roles.cache.get(cfg.verifyRoleId) : null;
    const me = guild.members.me;

    const verdict = evaluateVerify({
        roleExists: Boolean(role),
        hasRole: Boolean(role) && member.roles.cache.has(role.id),
        raidMode: isRaidMode(guild.id),
        botCanAssign: Boolean(role) && !role.managed && me.permissions.has('ManageRoles') && me.roles.highest.comparePositionTo(role) > 0,
    });

    if (!verdict.ok) {
        return interaction.reply({ content: verdict.message, flags: MessageFlags.Ephemeral });
    }

    try {
        await member.roles.add(role, 'Passed the 18+ verification gate');
    } catch (err) {
        logger.warn(`[VERIFY] Could not give ${role.id} to ${member.id}: ${err.message}`);
        return interaction.reply({ content: 'Something went wrong giving you the role. Ping a mod.', flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: verdict.message, flags: MessageFlags.Ephemeral });
}

module.exports = { VERIFY_ID, DEFAULT_RULES, buildGatePanel, evaluateVerify, handleVerifyButton };
