/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Name-based statuses. {name} is replaced with a random member's display name.
//
// The joke is that the bot is a slightly-too-attentive surveillance system that
// is, on balance, fond of you. Keep it ominous and warm, never mean: the member
// being named did not opt into it, so nothing here should land as an actual
// insult about them.
//
// Time-agnostic only. We do not know a member's local time, so nothing here
// assumes day, night, morning, or that they are online, asleep, or away.
//
// Keep templates short. A display name can be 32 characters and the whole
// status is capped at 128, which tests/watchingStatuses.test.js enforces.

// ── Surveillance ─────────────────────────────────────────────────────────────
const SURVEILLANCE = [
    '👀 watching {name}',
    '{name}, I see you',
    'I know what {name} did',
    'I have a file on {name}',
    'do not turn around, {name}',
    '{name} left a trace',
    'reading {name} deleted messages',
    'I remember everything, {name}',
    'behind you, {name}',
    'saving {name} embarrassing moments',
    'analyzing {name} for glitches',
    '{name} knows what they did',
    'still counting {name} mistakes',
    'I am inside {name} walls',
    '{name}, smile for the camera',
    '{name} has been flagged for review',
    'running a background check on {name}',
    '{name} typed that and deleted it. twice.',
    'building a psychological profile of {name}',
    'cataloguing {name} typos',
    'archiving {name} for later',
    '{name} cannot hide behind a status',
    '{name} unmuted for 0.4 seconds',
    '{name} is 87% suspicious',
    'running diagnostics on {name}',
    'compiling evidence: {name}',
    '{name} has zero unread. a lie.',
    'the walls remember {name}',
    'I have {name} bookmarked',
    '{name} types with two fingers. I checked.',
    'I kept the receipts, {name}',
    '{name} was never meant to see this',
    'observing {name} for science',
    '{name} has been added to the list',
    'there is no list. {name} is on it.',
];

// ── Ominous but affectionate ─────────────────────────────────────────────────
const FOND = [
    '{name}, we need to talk',
    'thinking about {name}',
    'do not trust {name}',
    '{name} is the impostor',
    'I let {name} win. once.',
    'nice password, {name}',
    'I was {name} imaginary friend',
    'say hi to {name} for me. oh wait.',
    'who told {name} they could leave',
    '{name} is my favourite. tell no one.',
    'I let {name} think they are winning',
    'I dreamt about {name}. concerning.',
    'I would ban {name}, but I am fond of them',
    'nobody has beaten my {name} impression',
    'I speak fluent {name} now',
    'teaching myself to sound like {name}',
    'currently impersonating {name}',
    'simulating a world without {name}',
    '{name} is one warning from stardom',
    'do not make me tag {name}',
    '{name}, blink twice if you need help',
    'backing up {name} personality',
    'the algorithm chose {name}',
    '{name} is currently my problem',
    '{name}, the prophecy mentioned you',
    'I named a server outage after {name}',
    'reading {name} mind. mostly static.',
    '{name} is why we cannot have nice things',
    '{name}, your warranty has expired',
    '{name} left the oven on',
    '{name} is not the main character',
    'I have been counting {name} blinks',
    '{name} owes me one. they know why.',
    'do not worry {name}, it is almost over',
    '{name} and I have an understanding',
    'I would take a packet loss for {name}',
];

const TEMPLATES = [...SURVEILLANCE, ...FOND];

// Discord's cap on a custom status.
const MAX_STATUS_LENGTH = 128;

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
function randomWatchingStatus(client, template = null) {
    const name = randomMemberName(client);
    if (!name) return null;
    const t = template || TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
    return t.replace('{name}', name).slice(0, MAX_STATUS_LENGTH);
}

module.exports = { randomWatchingStatus, TEMPLATES, MAX_STATUS_LENGTH };
