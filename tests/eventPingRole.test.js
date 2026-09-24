/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// /event create is open to every member, so ping_role decides whether an
// ordinary member can make the bot mention a role they couldn't mention
// themselves. These tests pin that rule down.

jest.mock('../src/utils/guildConfigCache', () => ({ getGuildConfig: jest.fn() }));

const { PermissionFlagsBits } = require('discord.js');
const { getGuildConfig } = require('../src/utils/guildConfigCache');
const { resolveGamePingRole } = require('../src/commands/event');

const GUILD_ID = 'guild-1';
const VALORANT_ROLE = 'role-valorant';
const MOD_ROLE = 'role-moderators';

// An interaction stub: a guild with two roles, and a member who is or isn't a
// manager.
function interactionFor({ isManager = false } = {}) {
    const roles = new Map([
        [VALORANT_ROLE, { id: VALORANT_ROLE, name: 'Valorant' }],
        [MOD_ROLE, { id: MOD_ROLE, name: 'Moderators' }],
    ]);
    return {
        guild: { id: GUILD_ID, roles: { cache: roles } },
        member: {
            permissions: {
                has: flag => isManager
                    && (flag === PermissionFlagsBits.ManageEvents || flag === PermissionFlagsBits.ManageGuild),
            },
        },
    };
}

const everyoneRole = { id: GUILD_ID, name: '@everyone' };
const valorantRole = { id: VALORANT_ROLE, name: 'Valorant' };
const modRole = { id: MOD_ROLE, name: 'Moderators' };

beforeEach(() => {
    getGuildConfig.mockResolvedValue({ selfRoles: [{ roleId: VALORANT_ROLE, label: 'Valorant' }] });
});

describe('explicit ping_role', () => {
    test('a member may ping a self-assign role', async () => {
        const out = await resolveGamePingRole(interactionFor(), 'Valorant', valorantRole);
        expect(out).toEqual({ roleId: VALORANT_ROLE });
    });

    test('a member may NOT ping an arbitrary role', async () => {
        // The abuse this blocks: the bot sends the mention, so without this any
        // member could have it ping @Moderators.
        const out = await resolveGamePingRole(interactionFor(), 'Valorant', modRole);
        expect(out).toEqual({ roleId: null, denied: 'not-self-role' });
    });

    test('nobody may ping @everyone, not even a manager', async () => {
        for (const isManager of [false, true]) {
            const out = await resolveGamePingRole(interactionFor({ isManager }), 'Valorant', everyoneRole);
            expect(out).toEqual({ roleId: null, denied: 'everyone' });
        }
    });

    test('a manager may ping any other role', async () => {
        const out = await resolveGamePingRole(interactionFor({ isManager: true }), 'Valorant', modRole);
        expect(out).toEqual({ roleId: MOD_ROLE });
    });

    test('a guild with no self-roles configured still blocks a member', async () => {
        getGuildConfig.mockResolvedValue(null);
        const out = await resolveGamePingRole(interactionFor(), 'Valorant', modRole);
        expect(out.denied).toBe('not-self-role');
    });
});

describe('auto-matching from the game name', () => {
    test('matches a self-role by its menu label', async () => {
        const out = await resolveGamePingRole(interactionFor(), 'valorant', null);
        expect(out).toEqual({ roleId: VALORANT_ROLE });
    });

    test('matches on the actual role name too', async () => {
        getGuildConfig.mockResolvedValue({ selfRoles: [{ roleId: VALORANT_ROLE, label: 'VAL' }] });
        const out = await resolveGamePingRole(interactionFor(), '  Valorant ', null);
        expect(out).toEqual({ roleId: VALORANT_ROLE });
    });

    test('pings nothing when the game matches no self-role', async () => {
        const out = await resolveGamePingRole(interactionFor(), 'Minesweeper', null);
        expect(out).toEqual({ roleId: null });
    });

    test('auto-matching can only ever land on a self-role', async () => {
        // It searches the self-role list, so it cannot select @Moderators however
        // the event is named.
        const out = await resolveGamePingRole(interactionFor(), 'Moderators', null);
        expect(out).toEqual({ roleId: null });
    });
});
