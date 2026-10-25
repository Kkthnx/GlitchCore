/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Editing a clean message into a banned one must hit the word filter, the same
// as posting it would.

jest.mock('../src/utils/auditLog', () => ({ getAuditChannel: jest.fn().mockResolvedValue(null), postAudit: jest.fn() }));
jest.mock('../src/utils/guildConfigCache', () => ({ getGuildConfig: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/utils/autoMod', () => ({
    evaluateContentFilter: jest.fn(),
    enforceContentFilter: jest.fn().mockResolvedValue(),
}));

const { evaluateContentFilter, enforceContentFilter } = require('../src/utils/autoMod');
const messageUpdate = require('../src/events/messageUpdate');

const edit = (overrides = {}) => ({
    oldMessage: { partial: false, content: 'hello everyone' },
    newMessage: { guild: { id: 'g1' }, partial: false, author: { id: 'u1', bot: false }, content: 'edited', ...overrides },
});

beforeEach(() => jest.clearAllMocks());

describe('messageUpdate word filter', () => {
    test('runs the filter on a content edit and enforces a hit', async () => {
        evaluateContentFilter.mockReturnValue('Racism/Slurs');
        const { oldMessage, newMessage } = edit();
        await messageUpdate.execute(oldMessage, newMessage);
        expect(evaluateContentFilter).toHaveBeenCalledWith(newMessage, {});
        expect(enforceContentFilter).toHaveBeenCalledWith(newMessage, 'Racism/Slurs', {});
    });

    test('a clean edit is left alone', async () => {
        evaluateContentFilter.mockReturnValue(null);
        const { oldMessage, newMessage } = edit();
        await messageUpdate.execute(oldMessage, newMessage);
        expect(enforceContentFilter).not.toHaveBeenCalled();
    });

    test('embed unfurls (no content change) are not re-checked', async () => {
        const { oldMessage, newMessage } = edit({ content: 'hello everyone' });
        await messageUpdate.execute(oldMessage, newMessage);
        expect(evaluateContentFilter).not.toHaveBeenCalled();
    });

    test('bots, DMs and partial edits are skipped', async () => {
        await messageUpdate.execute(edit().oldMessage, edit({ author: { id: 'b', bot: true } }).newMessage);
        await messageUpdate.execute(edit().oldMessage, edit({ guild: null }).newMessage);
        await messageUpdate.execute(edit().oldMessage, edit({ partial: true }).newMessage);
        expect(evaluateContentFilter).not.toHaveBeenCalled();
    });
});
