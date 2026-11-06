/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

jest.mock('../src/utils/guildConfigCache', () => ({ getGuildConfig: jest.fn() }));

const { getGuildConfig } = require('../src/utils/guildConfigCache');
const raid = require('../src/utils/raidMode');
const { evaluateVerify, handleVerifyButton, buildGatePanel, VERIFY_ID } = require('../src/utils/verifyManager');

const OK = { roleExists: true, hasRole: false, raidMode: false, botCanAssign: true };

describe('evaluateVerify', () => {
    test('lets a normal click through', () => {
        expect(evaluateVerify(OK)).toMatchObject({ ok: true });
    });

    test.each([
        ['the role was deleted', { roleExists: false }],
        ['the member already has the role', { hasRole: true }],
        ['raid mode is on', { raidMode: true }],
        ['the bot cannot assign the role', { botCanAssign: false }],
    ])('refuses when %s', (_label, patch) => {
        expect(evaluateVerify({ ...OK, ...patch }).ok).toBe(false);
    });

    test('a missing role beats every other reason', () => {
        expect(evaluateVerify({ ...OK, roleExists: false, hasRole: true }).message).toMatch(/not set up/);
    });
});

describe('handleVerifyButton', () => {
    function makeInteraction({ hasRole = false } = {}) {
        const role = { id: 'gate', managed: false, comparePositionTo: undefined };
        const roles = { cache: new Map([['gate', role]]) };
        return {
            role,
            interaction: {
                guild: {
                    id: 'g1',
                    roles,
                    members: { me: { permissions: { has: () => true }, roles: { highest: { comparePositionTo: () => 1 } } } },
                },
                member: {
                    id: 'u1',
                    roles: { cache: new Map(hasRole ? [['gate', role]] : []), add: jest.fn().mockResolvedValue() },
                },
                reply: jest.fn().mockResolvedValue(),
            },
        };
    }

    beforeEach(() => {
        raid._clearAll();
        getGuildConfig.mockResolvedValue({ verifyRoleId: 'gate' });
    });

    test('grants the gate role', async () => {
        const { interaction, role } = makeInteraction();
        await handleVerifyButton(interaction);
        expect(interaction.member.roles.add).toHaveBeenCalledWith(role, expect.any(String));
    });

    test('does not grant it during raid mode', async () => {
        const { interaction } = makeInteraction();
        raid.setRaidMode('g1', true, 60000);
        await handleVerifyButton(interaction);
        expect(interaction.member.roles.add).not.toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].content).toMatch(/paused/);
    });

    test('does nothing when the gate is not configured', async () => {
        const { interaction } = makeInteraction();
        getGuildConfig.mockResolvedValue({});
        await handleVerifyButton(interaction);
        expect(interaction.member.roles.add).not.toHaveBeenCalled();
    });

    test('replies with a friendly message when the role add fails', async () => {
        const { interaction } = makeInteraction();
        interaction.member.roles.add.mockRejectedValue(new Error('Missing Permissions'));
        await handleVerifyButton(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toMatch(/Ping a mod/);
    });
});

describe('buildGatePanel', () => {
    test('carries the button the interaction router listens for', () => {
        const panel = buildGatePanel();
        expect(panel.components[0].components[0].data.custom_id).toBe(VERIFY_ID);
    });
});
