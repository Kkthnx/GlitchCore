/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../../config.json');

// ---------------------------------------------------------------------------
// Glitch Haven brand kit, mirrors the design tokens from the kkthnx-site
// (src/styles/global.css). Discord embeds only get one accent stripe, so the
// site's CSS custom properties are distilled into a small semantic palette.
// Keeping this in one place means every embed reads as the same product.
// ---------------------------------------------------------------------------
const PALETTE = {
    accent: 0x5cc8ff, // --accent  (primary cyan)
    wow: 0xb483ff,    // --wow     (purple)
    gen: 0x34d3b4,    // --gen     (teal / success)
    tech: 0xf0b429,   // --tech    (gold / hype)
    danger: 0xff6b6b, // soft red  (moderation / errors)
    ink: 0x0a0d13,    // --ink     (near-black)
    dim: 0x7c8aa0,    // --dim     (muted text)
};

// Semantic roles so call sites read intent, not hex.
const COLORS = {
    primary: PALETTE.accent,
    success: PALETTE.gen,
    hype: PALETTE.tech,
    danger: PALETTE.danger,
    neutral: PALETTE.dim,
    accent: PALETTE.wow,
};

const BRAND = {
    community: 'Glitch Haven',
    bot: 'GlitchCore',
    // A small glitch flourish echoing the site's Chakra Petch display font vibe.
    footer: 'Glitch Haven',
};

/**
 * Base embed pre-styled with the Glitch Haven identity: brand accent, a
 * consistent footer, and a timestamp. Pass overrides as needed.
 * @param {{ color?: number, footer?: string }} [opts]
 */
function brandedEmbed({ color = COLORS.primary, footer = BRAND.footer } = {}) {
    return new EmbedBuilder()
        .setColor(color)
        .setFooter({ text: footer })
        .setTimestamp();
}

/**
 * Unicode progress bar for XP/level displays (matches the site's slim meters).
 * @param {number} ratio - 0..1
 * @param {number} [slots=12]
 */
function progressBar(ratio, slots = 12) {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    const filled = Math.round(clamped * slots);
    return '▰'.repeat(filled) + '▱'.repeat(slots - filled);
}

module.exports = { BRAND, COLORS, PALETTE, brandedEmbed, progressBar, config };
