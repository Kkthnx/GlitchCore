/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { blockReason } = require('../src/utils/moderationManager');

// A fake interaction, with a role position standing in for the real comparison.
// compare(a, b) in discord.js is positive when the first role ranks higher.
function setup({ modPos = 10, targetPos = 5, modIsOwner = false, target = {} } = {}) {
    const role = pos => ({ pos, comparePositionTo: other => pos - other.pos });
    const interaction = {
        user: { id: 'mod' },
        client: { user: { id: 'bot' } },
        guild: { ownerId: modIsOwner ? 'mod' : 'owner' },
        member: { roles: { highest: role(modPos) } },
    };
    const member = {
        id: 'target',
        roles: { highest: role(targetPos) },
        bannable: true,
        kickable: true,
        moderatable: true,
        ...target,
    };
    return { interaction, member };
}

describe('who can never be moderated', () => {
    test('a target that is not in the server is left to the caller', () => {
        const { interaction } = setup();
        expect(blockReason(interaction, null)).toBeNull();
    });

    test('yourself', () => {
        const { interaction, member } = setup({ target: { id: 'mod' } });
        expect(blockReason(interaction, member)).toMatch(/yourself/);
    });

    test('the bot', () => {
        const { interaction, member } = setup({ target: { id: 'bot' } });
        expect(blockReason(interaction, member)).toMatch(/myself/);
    });

    test('the server owner', () => {
        const { interaction, member } = setup({ target: { id: 'owner' } });
        expect(blockReason(interaction, member)).toMatch(/owner/);
    });
});

describe('role hierarchy', () => {
    test('allows a moderator who outranks the target', () => {
        const { interaction, member } = setup({ modPos: 10, targetPos: 5 });
        expect(blockReason(interaction, member)).toBeNull();
    });

    test('blocks a target with an equal role', () => {
        const { interaction, member } = setup({ modPos: 5, targetPos: 5 });
        expect(blockReason(interaction, member)).toMatch(/equal or higher/);
    });

    test('blocks a target with a higher role', () => {
        const { interaction, member } = setup({ modPos: 3, targetPos: 9 });
        expect(blockReason(interaction, member)).toMatch(/equal or higher/);
    });

    test('the server owner skips the hierarchy check', () => {
        const { interaction, member } = setup({ modPos: 1, targetPos: 99, modIsOwner: true });
        expect(blockReason(interaction, member)).toBeNull();
    });
});

describe('whether the bot itself can act', () => {
    test('a ban needs the target to be bannable', () => {
        const { interaction, member } = setup({ target: { bannable: false } });
        expect(blockReason(interaction, member, { needBannable: true })).toMatch(/can't do that/);
    });

    test('a ban ignores whether the target is kickable or moderatable', () => {
        const { interaction, member } = setup({ target: { kickable: false, moderatable: false } });
        expect(blockReason(interaction, member, { needBannable: true })).toBeNull();
    });

    test('a timeout needs the target to be moderatable', () => {
        const { interaction, member } = setup({ target: { moderatable: false } });
        expect(blockReason(interaction, member)).toMatch(/can't do that/);
    });

    test('a timeout is refused for a target holding Administrator, which is not moderatable', () => {
        const { interaction, member } = setup({ target: { moderatable: false, kickable: true } });
        expect(blockReason(interaction, member)).not.toBeNull();
    });

    test('a kick needs the target to be kickable', () => {
        const { interaction, member } = setup({ target: { kickable: false } });
        expect(blockReason(interaction, member, { needKickable: true })).toMatch(/can't do that/);
    });

    test('a kick is allowed for a target holding Administrator, who is kickable but not moderatable', () => {
        // The case /kick used to get wrong. It tested moderatable, so any staff
        // member with Administrator below the bot was refused.
        const { interaction, member } = setup({ target: { moderatable: false, kickable: true } });
        expect(blockReason(interaction, member, { needKickable: true })).toBeNull();
    });

    test('a kick does not require the bot to hold Moderate Members', () => {
        // Without that permission every member reads as not moderatable, yet the
        // bot can still kick people if it has Kick Members.
        const { interaction, member } = setup({ target: { moderatable: false, kickable: true } });
        expect(blockReason(interaction, member, { needKickable: true })).toBeNull();
    });

    test('a warning takes no action, so the bot is not asked at all', () => {
        const { interaction, member } = setup({ target: { bannable: false, kickable: false, moderatable: false } });
        expect(blockReason(interaction, member, { requireBotAction: false })).toBeNull();
    });

    test('the hierarchy still applies to a warning', () => {
        const { interaction, member } = setup({ modPos: 2, targetPos: 8, target: { moderatable: false } });
        expect(blockReason(interaction, member, { requireBotAction: false })).toMatch(/equal or higher/);
    });
});
