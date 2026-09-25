/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// The event card is rebuilt on every RSVP. When it grew past Discord's 4096
// character description limit, discord.js threw, so the card froze while RSVPs
// kept landing in the database and every member clicking got a generic error.
// /event create allows a capacity of 100 and 0 means unlimited, so this was
// reachable with the command's own documented options.

const { buildEventEmbed } = require('../src/utils/eventManager');
const { LIMITS } = require('../src/utils/embedText');

const id = n => String(100000000000000000n + BigInt(n));
const people = n => Array.from({ length: n }, (_, i) => ({ userId: id(i), username: `player${i}` }));

function event(overrides = {}) {
    return {
        guildId: 'g', channelId: 'c', messageId: 'm', hostId: id(0),
        game: 'Helldivers 2', title: 'Ranked grind night', description: null,
        startsAt: new Date('2026-10-01T20:00:00Z'),
        capacity: 0, going: [], maybe: [], waitlist: [],
        status: 'SCHEDULED', recurrence: 'none', pingRoleId: null, imgUrl: null,
        ...overrides,
    };
}

describe('buildEventEmbed stays inside Discord limits', () => {
    test('a full 100-slot roster with a long maybe and waitlist', () => {
        const embed = buildEventEmbed(event({ capacity: 100, going: people(100), maybe: people(40), waitlist: people(40) }));
        expect(embed.data.description.length).toBeLessThanOrEqual(LIMITS.description);
    });

    test('a full roster alongside the longest description the option allows', () => {
        // /event create caps description at 500 characters.
        const embed = buildEventEmbed(event({
            capacity: 100, going: people(100), maybe: people(40), waitlist: people(40),
            description: 'd'.repeat(500),
            game: 'x'.repeat(60), title: 'y'.repeat(100), pingRoleId: id(9),
        }));
        expect(embed.data.description.length).toBeLessThanOrEqual(LIMITS.description);
    });

    test('an unlimited-capacity event with a huge turnout', () => {
        // capacity 0 means no cap, so `going` has no natural ceiling at all.
        const embed = buildEventEmbed(event({ capacity: 0, going: people(600) }));
        expect(embed.data.description.length).toBeLessThanOrEqual(LIMITS.description);
    });

    test('says how many it left out rather than silently dropping them', () => {
        const embed = buildEventEmbed(event({ capacity: 100, going: people(100), maybe: people(40), waitlist: people(40) }));
        expect(embed.data.description).toMatch(/and \d+ more/);
    });

    test('a normal-sized event is untouched, with no summary line', () => {
        const embed = buildEventEmbed(event({ capacity: 5, going: people(5) }));
        expect(embed.data.description).not.toMatch(/and \d+ more/);
        // Every slot still rendered.
        expect(embed.data.description).toContain('`[05]`');
    });

    test('the sign-up-free weekly reminder card also fits', () => {
        const embed = buildEventEmbed(event({ recurrence: 'weekly', description: 'd'.repeat(500), pingRoleId: id(9) }));
        expect(embed.data.description.length).toBeLessThanOrEqual(LIMITS.description);
    });

    test('never throws across a sweep of roster sizes', () => {
        for (const going of [0, 1, 25, 50, 99, 100, 250]) {
            for (const extra of [0, 20, 50]) {
                expect(() => buildEventEmbed(event({
                    capacity: 100, going: people(going), maybe: people(extra), waitlist: people(extra),
                }))).not.toThrow();
            }
        }
    });
});
