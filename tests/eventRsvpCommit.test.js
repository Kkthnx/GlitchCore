/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// commitRsvp is the most contended write in the bot: every member RSVPs to the
// same message. These tests stand a fake collection in for the Event model so
// the compare-and-swap can be driven deterministically, including the case
// where a competing write lands between the read and the update.

jest.mock('../src/database/EventSchema', () => {
    // Mongoose queries are thenable and support .lean(), so the fake mimics both.
    const query = value => ({
        lean: () => Promise.resolve(value),
        then: (onFulfilled, onRejected) => Promise.resolve(value).then(onFulfilled, onRejected),
    });

    const model = {
        doc: null,
        // Runs once, just before the next update is evaluated, to simulate a
        // competing writer landing inside the read-update window.
        raceOnce: null,
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
        updateOne: jest.fn(),
        reset(doc = null) {
            model.doc = doc;
            model.raceOnce = null;
            model.findOne.mockReset().mockImplementation(() => query(model.doc ? { ...model.doc } : null));
            model.updateOne.mockReset().mockImplementation(() => query({}));
            model.findOneAndUpdate.mockReset().mockImplementation((filter, update) => {
                if (model.raceOnce) {
                    const race = model.raceOnce;
                    model.raceOnce = null;
                    race();
                }
                if (!model.doc) return query(null);
                // The compare half, in both forms the caller can send.
                const wantsMissing = filter.__v && filter.__v.$exists === false;
                const matches = wantsMissing
                    ? model.doc.__v === undefined
                    : model.doc.__v === filter.__v;
                if (!matches) return query(null);
                Object.assign(model.doc, update.$set);
                model.doc.__v = (model.doc.__v ?? 0) + update.$inc.__v;
                return query({ ...model.doc });
            });
        },
    };
    model.reset();
    return model;
});

const Event = require('../src/database/EventSchema');
const { commitRsvp } = require('../src/utils/eventManager');

const alice = { userId: 'a', username: 'alice' };
const bob = { userId: 'b', username: 'bob' };

function seed(overrides = {}) {
    Event.reset({
        _id: 'evt-1',
        __v: 0,
        status: 'SCHEDULED',
        capacity: 0,
        going: [],
        maybe: [],
        waitlist: [],
        ...overrides,
    });
}

beforeEach(() => seed());

describe('commitRsvp', () => {
    test('records a going RSVP and bumps the version', async () => {
        const { event, result, reason } = await commitRsvp('m1', alice, 'going');

        expect(reason).toBeUndefined();
        expect(result.status).toBe('going');
        expect(event.going.map(m => m.userId)).toEqual(['a']);
        expect(event.__v).toBe(1);
    });

    test('a second choice from the same member replaces the first', async () => {
        await commitRsvp('m1', alice, 'going');
        const { event } = await commitRsvp('m1', alice, 'maybe');

        expect(event.going).toEqual([]);
        expect(event.maybe.map(m => m.userId)).toEqual(['a']);
    });

    test('reports a missing event', async () => {
        Event.reset(null);
        expect((await commitRsvp('m1', alice, 'going')).reason).toBe('missing');
    });

    test('refuses to RSVP to an event that is not scheduled', async () => {
        seed({ status: 'STARTED' });
        expect((await commitRsvp('m1', alice, 'going')).reason).toBe('closed');

        seed({ status: 'CANCELLED' });
        expect((await commitRsvp('m1', alice, 'going')).reason).toBe('closed');
    });

    test('retries and keeps the competing RSVP when another write lands first', async () => {
        // Bob's RSVP commits in the window between our read and our update, so
        // the first attempt must fail the version check and start over.
        Event.raceOnce = () => {
            Event.doc.going.push(bob);
            Event.doc.__v += 1;
        };

        const { event, reason } = await commitRsvp('m1', alice, 'going');

        expect(reason).toBeUndefined();
        expect(Event.findOneAndUpdate).toHaveBeenCalledTimes(2); // lost once, then won
        // The bug this replaces would have left Bob out: Alice's write was built
        // from a snapshot taken before his landed.
        expect(event.going.map(m => m.userId).sort()).toEqual(['a', 'b']);
    });

    test('gives up rather than writing stale rosters when it keeps losing', async () => {
        // A competitor that wins every single time.
        Event.findOneAndUpdate.mockImplementation(() => ({ lean: () => Promise.resolve(null) }));

        const { reason, event } = await commitRsvp('m1', alice, 'going', 3);

        expect(reason).toBe('contended');
        expect(event).toBeUndefined();
        expect(Event.findOneAndUpdate).toHaveBeenCalledTimes(3);
    });

    test('spills past capacity to the waitlist', async () => {
        seed({ capacity: 1, going: [bob] });
        const { result, event } = await commitRsvp('m1', alice, 'going');

        expect(result.status).toBe('waitlisted');
        expect(event.waitlist.map(m => m.userId)).toEqual(['a']);
    });

    test('promotes off the waitlist when a going slot frees up', async () => {
        seed({ capacity: 1, going: [bob], waitlist: [alice] });
        const { result, event } = await commitRsvp('m1', bob, 'decline');

        expect(result.promoted).toEqual(['a']);
        expect(event.going.map(m => m.userId)).toEqual(['a']);
        expect(event.waitlist).toEqual([]);
    });

    test('still swaps safely on a document that has no version stamp', async () => {
        seed({ __v: undefined });
        // "Still unversioned" is as good a thing to compare against as "still at
        // version N". Matching a literal 0 here would never match, which would
        // wedge RSVPs on that event forever.
        const { event, reason } = await commitRsvp('m1', alice, 'going');

        expect(reason).toBeUndefined();
        expect(event.going.map(m => m.userId)).toEqual(['a']);
        expect(event.__v).toBe(1);
    });

    test('an unversioned document is still protected from a racing write', async () => {
        seed({ __v: undefined });
        Event.raceOnce = () => {
            Event.doc.going.push(bob);
            Event.doc.__v = 1; // the competitor stamped it on the way past
        };

        const { event } = await commitRsvp('m1', alice, 'going');
        expect(event.going.map(m => m.userId).sort()).toEqual(['a', 'b']);
    });
});
