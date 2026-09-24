/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// These tests exist to keep the code and PRIVACY.md from drifting apart. An
// export that understates what's held, or a deletion that quietly leaves
// something behind, is the kind of bug you only find when somebody asks.

const MODELS = {
    UserSchema: 'User',
    InfractionSchema: 'Infraction',
    EventSchema: 'Event',
    LfgSchema: 'LfgSession',
    BirthdaySchema: 'Birthday',
    ReminderSchema: 'Reminder',
    GiveawaySchema: 'Giveaway',
    StreamerSchema: 'Streamer',
    SuggestionSchema: 'Suggestion',
};

// One shared record of every call, so a test can assert which collections were
// touched and how.
const calls = [];

function fakeModel(name) {
    const query = value => ({ lean: () => Promise.resolve(value) });
    return {
        find: jest.fn((filter, projection) => { calls.push({ name, op: 'find', filter, projection }); return query([]); }),
        findOne: jest.fn((filter, projection) => { calls.push({ name, op: 'findOne', filter, projection }); return query(null); }),
        deleteOne: jest.fn(filter => { calls.push({ name, op: 'deleteOne', filter }); return Promise.resolve({ deletedCount: 1 }); }),
        deleteMany: jest.fn(filter => { calls.push({ name, op: 'deleteMany', filter }); return Promise.resolve({ deletedCount: 2 }); }),
        updateMany: jest.fn((filter, update) => { calls.push({ name, op: 'updateMany', filter, update }); return Promise.resolve({ modifiedCount: 1 }); }),
        countDocuments: jest.fn(filter => { calls.push({ name, op: 'countDocuments', filter }); return Promise.resolve(3); }),
    };
}

for (const [file, name] of Object.entries(MODELS)) {
    jest.doMock(`../src/database/${file}`, () => fakeModel(name));
}

const { exportUserData, deleteUserData } = require('../src/utils/privacyManager');

const GUILD = 'g1';
const USER = 'u1';

function touched(name, op) {
    return calls.filter(c => c.name === name && c.op === op);
}

beforeEach(() => { calls.length = 0; });

describe('exportUserData', () => {
    beforeEach(async () => { await exportUserData(GUILD, USER); });

    test('reads every collection that keys on a person', () => {
        // If a new user-keyed collection is added, this is the list to extend,
        // along with the PRIVACY.md table.
        for (const name of ['User', 'Infraction', 'Event', 'LfgSession', 'Birthday', 'Reminder', 'Giveaway', 'Streamer', 'Suggestion']) {
            expect(calls.some(c => c.name === name)).toBe(true);
        }
    });

    test('scopes every read to the one guild', () => {
        for (const call of calls) {
            expect(call.filter.guildId).toBe(GUILD);
        }
    });

    test('finds LFG membership on the waitlist, not just the roster', () => {
        const [lfg] = touched('LfgSession', 'find');
        expect(JSON.stringify(lfg.filter)).toContain('waitlist.userId');
    });

    test('returns the documented shape even when the user has nothing stored', async () => {
        const out = await exportUserData(GUILD, USER);
        expect(out).toMatchObject({
            guildId: GUILD,
            userId: USER,
            profile: null,
            birthday: null,
            infractions: [],
            eventMemberships: [],
            lfgMemberships: [],
            reminders: [],
            giveawayEntries: [],
            twitchLinks: [],
            suggestions: [],
        });
        expect(typeof out.exportedAt).toBe('string');
    });
});

describe('deleteUserData', () => {
    let result;
    beforeEach(async () => { result = await deleteUserData(GUILD, USER); });

    test('deletes the profile, birthday and reminders outright', () => {
        expect(touched('User', 'deleteOne')).toHaveLength(1);
        expect(touched('Birthday', 'deleteOne')).toHaveLength(1);
        expect(touched('Reminder', 'deleteMany')).toHaveLength(1);
    });

    test('pulls them from LFG rosters AND waitlists', () => {
        // The waitlist was previously missed, so somebody queued behind a full
        // lobby stayed on it after asking to be erased.
        const [lfg] = touched('LfgSession', 'updateMany');
        expect(lfg.update.$pull).toHaveProperty('roster');
        expect(lfg.update.$pull).toHaveProperty('waitlist');
    });

    test('pulls them from all three event lists', () => {
        const [event] = touched('Event', 'updateMany');
        expect(Object.keys(event.update.$pull).sort()).toEqual(['going', 'maybe', 'waitlist']);
    });

    test('withdraws them from open giveaway entries', () => {
        const [giveaway] = touched('Giveaway', 'updateMany');
        expect(giveaway.update.$pull).toEqual({ entries: USER });
    });

    test('unlinks their Twitch account without deleting the server-level channel', () => {
        const [streamer] = touched('Streamer', 'updateMany');
        expect(streamer.update).toEqual({ $set: { discordUserId: null } });
        expect(touched('Streamer', 'deleteOne')).toHaveLength(0);
        expect(touched('Streamer', 'deleteMany')).toHaveLength(0);
    });

    test('keeps moderation records, and only counts them', () => {
        // Deliberate: if a member could erase their own history the record would
        // be worthless. PRIVACY.md documents this.
        expect(touched('Infraction', 'countDocuments')).toHaveLength(1);
        expect(touched('Infraction', 'deleteOne')).toHaveLength(0);
        expect(touched('Infraction', 'deleteMany')).toHaveLength(0);
        expect(result.infractionsKept).toBe(3);
    });

    test('keeps published suggestions, and only counts them', () => {
        expect(touched('Suggestion', 'countDocuments')).toHaveLength(1);
        expect(touched('Suggestion', 'deleteMany')).toHaveLength(0);
        expect(result.suggestionsKept).toBe(3);
    });

    test('reports what it did so the confirmation can be specific', () => {
        expect(result).toMatchObject({
            profileDeleted: true,
            birthdayDeleted: true,
            remindersDeleted: 2,
            eventsUpdated: 1,
            lfgUpdated: 1,
            giveawaysUpdated: 1,
            twitchUnlinked: 1,
        });
    });

    test('never touches another guild', () => {
        for (const call of calls) {
            expect(call.filter.guildId).toBe(GUILD);
        }
    });
});
