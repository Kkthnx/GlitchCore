/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

jest.mock('../src/utils/guildConfigCache', () => ({ getGuildConfig: jest.fn() }));

const { getGuildConfig } = require('../src/utils/guildConfigCache');
const { rewardsEarned, findOrCreateRole, applyLevelRewards } = require('../src/utils/levelRewardManager');

describe('rewardsEarned', () => {
    const rewards = [{ level: 5, roleId: 'a' }, { level: 10, roleId: 'b' }, { level: 20, roleId: 'c' }];

    test('returns every reward at or below the level', () => {
        expect(rewardsEarned(rewards, 10).map(r => r.roleId)).toEqual(['a', 'b']);
    });

    test('a member who jumps past a threshold still earns it', () => {
        expect(rewardsEarned(rewards, 6).map(r => r.roleId)).toEqual(['a']);
    });

    test('returns nothing below the first threshold or with no rewards', () => {
        expect(rewardsEarned(rewards, 4)).toEqual([]);
        expect(rewardsEarned(undefined, 50)).toEqual([]);
    });
});

describe('findOrCreateRole', () => {
    function makeGuild() {
        const created = [];
        const cache = new Map();
        return {
            created,
            guild: {
                id: 'g1',
                roles: {
                    cache: { find: fn => [...cache.values()].find(fn) },
                    create: jest.fn(async ({ name }) => {
                        await new Promise(resolve => setTimeout(resolve, 10));
                        const role = { id: `r${created.length + 1}`, name };
                        created.push(role);
                        cache.set(role.id, role);
                        return role;
                    }),
                },
            },
        };
    }

    test('concurrent callers share one creation', async () => {
        const { guild, created } = makeGuild();

        const roles = await Promise.all([1, 2, 3, 4].map(() => findOrCreateRole(guild, 'Level 10', 'test')));

        expect(guild.roles.create).toHaveBeenCalledTimes(1);
        expect(created).toHaveLength(1);
        expect(new Set(roles.map(r => r.id)).size).toBe(1);
    });

    test('reuses the role once it exists, matching the name case-insensitively', async () => {
        const { guild } = makeGuild();
        await findOrCreateRole(guild, 'Level 10', 'test');
        const again = await findOrCreateRole(guild, 'level 10', 'test');

        expect(guild.roles.create).toHaveBeenCalledTimes(1);
        expect(again.name).toBe('Level 10');
    });

    test('a failed creation returns null and can be retried', async () => {
        const { guild } = makeGuild();
        guild.roles.create.mockRejectedValueOnce(new Error('Missing Permissions'));

        expect(await findOrCreateRole(guild, 'Level 20', 'test')).toBeNull();
        expect(await findOrCreateRole(guild, 'Level 20', 'test')).toMatchObject({ name: 'Level 20' });
    });
});

describe('applyLevelRewards', () => {
    test('grants every earned reward the member lacks', async () => {
        getGuildConfig.mockResolvedValue({ levelRewardRoles: [{ level: 5, roleId: 'a' }, { level: 10, roleId: 'b' }] });
        const member = { id: 'u1', roles: { cache: new Map([['a', {}]]), add: jest.fn().mockResolvedValue() } };

        await applyLevelRewards('u1', 'g1', 12, null, member);

        expect(member.roles.add).toHaveBeenCalledTimes(1);
        expect(member.roles.add).toHaveBeenCalledWith('b', 'Level reward');
    });
});
