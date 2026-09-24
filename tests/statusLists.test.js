/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Guards the rules written at the top of the two status files, so adding a
// status later can't quietly break the rotation.

const botStatuses = require('../src/utils/botStatuses');
const { randomWatchingStatus, TEMPLATES, MAX_STATUS_LENGTH } = require('../src/utils/watchingStatuses');

// Discord truncates a custom status past this, and a display name can be 32.
const MAX_NAME_LENGTH = 32;

function duplicatesIn(list) {
    const seen = new Set();
    const dupes = new Set();
    for (const item of list) {
        if (seen.has(item)) dupes.add(item);
        seen.add(item);
    }
    return [...dupes];
}

describe('botStatuses', () => {
    test('has a pool big enough that the rotation is not obviously cyclic', () => {
        // At one every 10 minutes, this is several days before a repeat.
        expect(botStatuses.length).toBeGreaterThanOrEqual(150);
    });

    test('contains no duplicates', () => {
        // A duplicate in a deck-based rotation just shows up twice as often.
        expect(duplicatesIn(botStatuses)).toEqual([]);
    });

    test('every status fits inside Discord\'s limit', () => {
        const tooLong = botStatuses.filter(s => s.length > MAX_STATUS_LENGTH);
        expect(tooLong).toEqual([]);
    });

    test('every status is a non-empty trimmed string', () => {
        for (const status of botStatuses) {
            expect(typeof status).toBe('string');
            expect(status.length).toBeGreaterThan(0);
            expect(status).toBe(status.trim());
        }
    });

    test('nothing assumes a time of day', () => {
        // Members are spread across timezones and the bot cannot know the local
        // time of whoever is reading, so "good morning" style lines never work.
        const timeWords = /\b(morning|afternoon|evening|tonight|midnight|good ?night|today|tomorrow|yesterday)\b/i;
        const offenders = botStatuses.filter(s => timeWords.test(s));
        expect(offenders).toEqual([]);
    });
});

describe('watchingStatuses templates', () => {
    test('has a decent spread of templates', () => {
        expect(TEMPLATES.length).toBeGreaterThanOrEqual(50);
    });

    test('contains no duplicates', () => {
        expect(duplicatesIn(TEMPLATES)).toEqual([]);
    });

    test('every template has exactly one {name} placeholder', () => {
        for (const template of TEMPLATES) {
            expect(template.match(/\{name\}/g)).toHaveLength(1);
        }
    });

    test('stays within the limit even for the longest possible display name', () => {
        // Substituting then slicing would otherwise cut a name mid-word.
        const longest = 'x'.repeat(MAX_NAME_LENGTH);
        const tooLong = TEMPLATES
            .map(t => t.replace('{name}', longest))
            .filter(s => s.length > MAX_STATUS_LENGTH);
        expect(tooLong).toEqual([]);
    });

    test('nothing assumes a time of day or an online state', () => {
        const assumptions = /\b(morning|afternoon|evening|tonight|midnight|asleep|awake|offline|still up|go to bed)\b/i;
        const offenders = TEMPLATES.filter(t => assumptions.test(t));
        expect(offenders).toEqual([]);
    });
});

describe('randomWatchingStatus', () => {
    // A client whose cache holds the given members, shaped like discord.js.
    function clientWith(members) {
        const collection = {
            size: members.length,
            filter: fn => {
                const kept = members.filter(fn);
                return { size: kept.length, at: i => kept[i] };
            },
        };
        return { guilds: { cache: { values: () => [{ members: { cache: collection } }] } } };
    }

    const human = { displayName: 'Kkthnx', user: { bot: false } };
    const bot = { displayName: 'SomeBot', user: { bot: true } };

    test('substitutes a cached member name', () => {
        const out = randomWatchingStatus(clientWith([human]), 'watching {name}');
        expect(out).toBe('watching Kkthnx');
    });

    test('never names a bot', () => {
        const out = randomWatchingStatus(clientWith([bot, human]), '{name} is here');
        expect(out).toBe('Kkthnx is here');
    });

    test('returns null when no human member is cached, so the caller falls back', () => {
        expect(randomWatchingStatus(clientWith([bot]), '{name}')).toBeNull();
        expect(randomWatchingStatus(clientWith([]), '{name}')).toBeNull();
    });

    test('truncates rather than emitting an over-long status', () => {
        const long = { displayName: 'y'.repeat(200), user: { bot: false } };
        const out = randomWatchingStatus(clientWith([long]), 'watching {name}');
        expect(out.length).toBe(MAX_STATUS_LENGTH);
    });
});
