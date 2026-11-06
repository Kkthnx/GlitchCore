/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

jest.mock('../src/database/EventSchema', () => ({ find: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn(), deleteOne: jest.fn() }));

const Event = require('../src/database/EventSchema');
const { processStartingEvents, LATE_START_GRACE_MS } = require('../src/utils/eventManager');

const MIN = 60 * 1000;

function makeEvent(startedAgoMs) {
    return {
        _id: 'e1',
        guildId: 'g1',
        channelId: 'c1',
        messageId: 'm1',
        title: 'Raid night',
        game: 'WoW',
        hostId: 'host',
        status: 'STARTED',
        capacity: 0,
        recurrence: 'none',
        startsAt: new Date(Date.now() - startedAgoMs),
        going: [{ userId: 'u1', username: 'a' }],
        maybe: [],
        waitlist: [],
    };
}

function setup(ev) {
    const send = jest.fn().mockResolvedValue({});
    const message = { edit: jest.fn().mockResolvedValue() };
    const channel = { send, messages: { fetch: jest.fn().mockResolvedValue(message) } };
    const guild = { channels: { cache: new Map([['c1', channel]]) } };
    const client = { guilds: { cache: new Map([['g1', guild]]) } };

    Event.find.mockResolvedValue([{ _id: ev._id }]);
    Event.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(ev) });
    return { client, send, message };
}

beforeEach(() => jest.clearAllMocks());

describe('processStartingEvents after downtime', () => {
    test('pings the roster when the event just started', async () => {
        const { client, send } = setup(makeEvent(1 * MIN));
        await processStartingEvents(client);
        await new Promise(resolve => setImmediate(resolve));
        expect(send).toHaveBeenCalledTimes(1);
    });

    test('stays quiet when the start time passed long ago', async () => {
        const { client, send, message } = setup(makeEvent(LATE_START_GRACE_MS + 5 * MIN));
        await processStartingEvents(client);
        await new Promise(resolve => setImmediate(resolve));
        expect(send).not.toHaveBeenCalled();
        // The card is still closed out so it does not sit there looking open.
        expect(message.edit).toHaveBeenCalledTimes(1);
    });
});
