/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Curated, recognizable colors for common roles so the bot can paint game /
// platform / region / ping roles their "real" color instead of a random one.
// Keys are normalized (lowercased, single-spaced); several aliases map to the
// same color. Unknown names fall back to a random palette color at the callsite.

const MAP = {
    // Platforms
    'pc': '#7aa2ff', 'xbox': '#107c10', 'playstation': '#1f6feb', 'ps': '#1f6feb',
    'switch': '#e60012', 'nintendo': '#e60012', 'mobile': '#34d3b4',

    // Regions
    'na': '#5cc8ff', 'eu': '#3a6ff0', 'oce': '#34d3b4', 'asia': '#ff6b6b', 'sa': '#2fe07a',

    // Ping / utility roles
    'double xp': '#f0b429', 'events': '#34d3b4', 'streams': '#9146ff',
    'announcements': '#ff5fd0', 'giveaways': '#f0b429', 'lfg': '#2fe07a',

    // Games (brand-ish colors)
    'valorant': '#ff4655',
    'world of warcraft': '#f4c430', 'wow': '#f4c430',
    'minecraft': '#5ca935',
    'league of legends': '#c8aa6e', 'league': '#c8aa6e', 'lol': '#c8aa6e',
    'fortnite': '#9d4dff',
    'counter-strike': '#f0a500', 'counter strike': '#f0a500', 'cs': '#f0a500', 'cs2': '#f0a500', 'csgo': '#f0a500',
    'overwatch': '#f99e1a', 'overwatch 2': '#f99e1a', 'ow': '#f99e1a',
    'apex': '#da292a', 'apex legends': '#da292a',
    'call of duty': '#5b6e2f', 'cod': '#5b6e2f', 'warzone': '#5b6e2f',
    'rocket league': '#1d8fe1', 'rl': '#1d8fe1',
    'gta': '#6ba539', 'grand theft auto': '#6ba539', 'gta v': '#6ba539', 'gta online': '#6ba539',
    'destiny': '#d4c08a', 'destiny 2': '#d4c08a',
    'elden ring': '#c0a062', 'dark souls': '#c0a062',
    'diablo': '#b3122a', 'diablo iv': '#b3122a', 'diablo 4': '#b3122a',
    'halo': '#2e7d5a',
    'roblox': '#e2231a', 'among us': '#c51111', 'rust': '#ce422b',
    'terraria': '#8bc34a', 'stardew valley': '#6cbb3c', 'stardew': '#6cbb3c',
    'palworld': '#4bb3c3', 'genshin impact': '#6db6c3', 'genshin': '#6db6c3',
    'dota': '#c23c2a', 'dota 2': '#c23c2a', 'pubg': '#f2a900',
    'sea of thieves': '#1f8fd6', 'the finals': '#d6234a', 'deadlock': '#c0703a',
    'marvel rivals': '#f04a4a', 'hades': '#e04a2a', 'fall guys': '#ff5fd0',
    'helldivers': '#e8b73a', 'helldivers 2': '#e8b73a', 'baldurs gate': '#a33a2a', "baldur's gate": '#a33a2a',
};

function normalize(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Returns a curated hex color for a known role name, or null if unknown. */
function smartColor(name) {
    return MAP[normalize(name)] || null;
}

module.exports = { smartColor, normalize, MAP };
