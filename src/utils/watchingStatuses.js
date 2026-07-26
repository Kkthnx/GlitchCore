/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Name-based statuses. {name} is replaced with a random member's display name.
// Time-agnostic only. We do not know a member's local time, so nothing here
// assumes day, night, morning, or that they are online, asleep, or away.
const TEMPLATES = [
    '👀 watching {name}',
    '{name}, I see you',
    '{name}, we need to talk',
    'I know what {name} did',
    'I have a file on {name}',
    'do not turn around, {name}',
    '{name} left a trace',
    'reading {name} deleted messages',
    'I remember everything {name}',
    'behind you, {name}',
    'thinking about {name}',
    'saving {name} embarrassing moments',
    'do not trust {name}',
    '{name} is the impostor',
    'I let {name} win. once.',
    'nice password, {name}',
    'analyzing {name} for glitches',
    '{name} knows what they did',
    'still counting {name} mistakes',
    'I am inside {name} walls',
    '{name}, smile for the camera',
    'who told {name} they could leave',
    'I was {name} imaginary friend',
    'say hi to {name} for me. oh wait.',
];

// Pick a random human member's display name from the client's cached guilds.
function randomMemberName(client) {
    const guilds = [...client.guilds.cache.values()];
    for (let tries = 0; tries < 8 && guilds.length; tries++) {
        const guild = guilds[Math.floor(Math.random() * guilds.length)];
        const members = guild.members.cache.filter(m => !m.user.bot);
        if (members.size) {
            const pick = members.at(Math.floor(Math.random() * members.size));
            return pick.displayName;
        }
    }
    return null;
}

// Returns a name-based status string, or null if no member is available.
function randomWatchingStatus(client) {
    const name = randomMemberName(client);
    if (!name) return null;
    const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
    return t.replace('{name}', name).slice(0, 128);
}

module.exports = { randomWatchingStatus, TEMPLATES };
