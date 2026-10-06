/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { AuditLogEvent: A, PermissionFlagsBits: P } = require('discord.js');
const { describeEntry, permissionDiff } = require('../src/utils/auditEntries');

const mod = { id: 'mod1' };
const base = { executor: mod, executorId: 'mod1', reason: null, changes: [], extra: null };
const field = (item, name) => item.fields.find(f => f.name === name)?.value;

describe('member actions', () => {
    test.each([
        [A.MemberKick, 'MEMBER_KICKED'],
        [A.MemberBanAdd, 'MEMBER_BANNED'],
        [A.MemberBanRemove, 'MEMBER_UNBANNED'],
    ])('action %i is described as %s with moderator and reason', (action, title) => {
        const [item] = describeEntry({
            ...base, action, targetId: 'u1', target: { id: 'u1', tag: 'vex' }, reason: 'spamming',
        });
        expect(item.title).toBe(title);
        expect(field(item, 'Member')).toBe('<@u1> vex');
        expect(field(item, 'Moderator')).toBe('<@mod1>');
        expect(field(item, 'Reason')).toBe('spamming');
    });

    test('a missing reason is spelled out rather than left blank', () => {
        const [item] = describeEntry({ ...base, action: A.MemberKick, targetId: 'u1' });
        expect(field(item, 'Reason')).toBe('No reason provided');
    });

    test('a timeout being set shows when it ends', () => {
        const until = '2030-01-01T00:00:00.000Z';
        const [item] = describeEntry({
            ...base, action: A.MemberUpdate, targetId: 'u1',
            changes: [{ key: 'communication_disabled_until', new: until }],
        });
        const unix = Math.floor(new Date(until).getTime() / 1000);
        expect(item.title).toBe('MEMBER_TIMED_OUT');
        expect(field(item, 'Until')).toContain(`<t:${unix}:F>`);
    });

    test('a timeout being lifted is its own entry', () => {
        const [item] = describeEntry({
            ...base, action: A.MemberUpdate, targetId: 'u1',
            changes: [{ key: 'communication_disabled_until', old: '2030-01-01T00:00:00.000Z' }],
        });
        expect(item.title).toBe('TIMEOUT_REMOVED');
    });

    test('a nickname change shows before and after', () => {
        const [item] = describeEntry({
            ...base, action: A.MemberUpdate, targetId: 'u1',
            changes: [{ key: 'nick', old: 'Old', new: 'New' }],
        });
        expect(item.title).toBe('NICKNAME_CHANGED');
        expect(field(item, 'Before')).toBe('Old');
        expect(field(item, 'After')).toBe('New');
    });

    test('clearing a nickname reads as none, not undefined', () => {
        const [item] = describeEntry({
            ...base, action: A.MemberUpdate, targetId: 'u1',
            changes: [{ key: 'nick', old: 'Old' }],
        });
        expect(field(item, 'After')).toBe('(none)');
    });

    test('a timeout and a nickname changed together produce two entries', () => {
        const out = describeEntry({
            ...base, action: A.MemberUpdate, targetId: 'u1',
            changes: [
                { key: 'communication_disabled_until', new: '2030-01-01T00:00:00.000Z' },
                { key: 'nick', old: 'a', new: 'b' },
            ],
        });
        expect(out.map(i => i.title)).toEqual(['MEMBER_TIMED_OUT', 'NICKNAME_CHANGED']);
    });

    test('an unrelated member update (like a server mute) is ignored', () => {
        expect(describeEntry({
            ...base, action: A.MemberUpdate, targetId: 'u1', changes: [{ key: 'mute', new: true }],
        })).toEqual([]);
    });
});

describe('role assignment', () => {
    test('lists the roles added and removed', () => {
        const [item] = describeEntry({
            ...base, action: A.MemberRoleUpdate, targetId: 'u1',
            changes: [
                { key: '$add', new: [{ id: 'r1', name: 'Mod' }] },
                { key: '$remove', new: [{ id: 'r2', name: 'Member' }] },
            ],
        });
        expect(item.title).toBe('ROLES_CHANGED');
        expect(field(item, 'Added')).toBe('<@&r1>');
        expect(field(item, 'Removed')).toBe('<@&r2>');
    });

    test('an entry with no roles in it is ignored', () => {
        expect(describeEntry({ ...base, action: A.MemberRoleUpdate, targetId: 'u1', changes: [] })).toEqual([]);
    });
});

describe('channels', () => {
    test('create and delete name the channel', () => {
        const [made] = describeEntry({ ...base, action: A.ChannelCreate, targetId: 'c1', changes: [{ key: 'name', new: 'lobby' }] });
        const [gone] = describeEntry({ ...base, action: A.ChannelDelete, targetId: 'c1', changes: [{ key: 'name', old: 'lobby' }] });
        expect(made.title).toBe('CHANNEL_CREATED');
        expect(field(made, 'Channel')).toContain('lobby');
        expect(gone.title).toBe('CHANNEL_DELETED');
        expect(field(gone, 'Channel')).toBe('#lobby');
    });

    test('an update lists only the changes that matter', () => {
        const [item] = describeEntry({
            ...base, action: A.ChannelUpdate, targetId: 'c1',
            changes: [
                { key: 'name', old: 'a', new: 'b' },
                { key: 'rate_limit_per_user', old: 0, new: 10 },
                { key: 'position', old: 1, new: 2 },
            ],
        });
        expect(field(item, 'Changes')).toBe('Name, a to b\nSlowmode seconds, 0 to 10');
    });

    test('an update that only moved the channel is ignored', () => {
        expect(describeEntry({
            ...base, action: A.ChannelUpdate, targetId: 'c1', changes: [{ key: 'position', old: 1, new: 2 }],
        })).toEqual([]);
    });

    test.each([
        [A.ChannelOverwriteCreate, 'added'],
        [A.ChannelOverwriteUpdate, 'changed'],
        [A.ChannelOverwriteDelete, 'removed'],
    ])('permission overrides (%i) read as %s', (action, verb) => {
        const [item] = describeEntry({ ...base, action, targetId: 'c1', extra: { role_name: 'Mod' } });
        expect(item.title).toBe('CHANNEL_PERMISSIONS_CHANGED');
        expect(field(item, 'Change')).toBe(`Permission override ${verb} for Mod`);
    });
});

describe('roles', () => {
    test('a permission change names what was gained and lost', () => {
        const [item] = describeEntry({
            ...base, action: A.RoleUpdate, targetId: 'r1',
            changes: [{ key: 'permissions', old: String(P.SendMessages), new: String(P.BanMembers) }],
        });
        expect(item.title).toBe('ROLE_UPDATED');
        expect(field(item, 'Changes')).toContain('Permissions gained, Ban Members');
        expect(field(item, 'Changes')).toContain('Permissions lost, Send Messages');
    });

    test('a color change is shown as hex', () => {
        const [item] = describeEntry({
            ...base, action: A.RoleUpdate, targetId: 'r1',
            changes: [{ key: 'color', old: 0, new: 0xff0000 }],
        });
        expect(field(item, 'Changes')).toBe('Color, #000000 to #ff0000');
    });

    test('create and delete are described', () => {
        const [made] = describeEntry({ ...base, action: A.RoleCreate, targetId: 'r1', changes: [{ key: 'name', new: 'VIP' }] });
        const [gone] = describeEntry({ ...base, action: A.RoleDelete, targetId: 'r1', changes: [{ key: 'name', old: 'VIP' }] });
        expect(made.title).toBe('ROLE_CREATED');
        expect(gone.title).toBe('ROLE_DELETED');
        expect(field(gone, 'Role')).toBe('VIP');
    });

    test('a role update with nothing worth logging is ignored', () => {
        expect(describeEntry({ ...base, action: A.RoleUpdate, targetId: 'r1', changes: [{ key: 'position', old: 1, new: 2 }] })).toEqual([]);
    });
});

describe('server and bulk deletes', () => {
    test('the owner field becomes a mention', () => {
        const [item] = describeEntry({
            ...base, action: A.GuildUpdate, changes: [{ key: 'owner_id', old: 'a', new: 'b' }],
        });
        expect(item.title).toBe('SERVER_UPDATED');
        expect(field(item, 'Changes')).toBe('Owner, <@a> to <@b>');
    });

    test('a bulk delete shows the channel and count', () => {
        const [item] = describeEntry({ ...base, action: A.MessageBulkDelete, targetId: 'c1', extra: { count: 42 } });
        expect(item.title).toBe('MESSAGES_BULK_DELETED');
        expect(field(item, 'Messages')).toBe('42');
    });
});

describe('robustness', () => {
    test('an action we do not handle returns nothing', () => {
        expect(describeEntry({ ...base, action: A.EmojiCreate })).toEqual([]);
    });

    test('an entry with no executor still describes, as Unknown', () => {
        const [item] = describeEntry({ action: A.MemberKick, targetId: 'u1', changes: [] });
        expect(field(item, 'Moderator')).toBe('Unknown');
    });

    test('an enormous value is clamped instead of overflowing an embed field', () => {
        const [item] = describeEntry({
            ...base, action: A.ChannelUpdate, targetId: 'c1',
            changes: [{ key: 'topic', old: 'x'.repeat(5000), new: 'y'.repeat(5000) }],
        });
        expect(field(item, 'Changes').length).toBeLessThan(1024);
    });
});

describe('permissionDiff', () => {
    test('reports nothing when permissions are identical', () => {
        expect(permissionDiff('8', '8')).toEqual({ gained: [], lost: [] });
    });

    test('accepts numbers, strings, bigints and bitfield objects', () => {
        const want = { gained: ['Administrator'], lost: [] };
        expect(permissionDiff(0, 8)).toEqual(want);
        expect(permissionDiff('0', '8')).toEqual(want);
        expect(permissionDiff(0n, 8n)).toEqual(want);
        expect(permissionDiff({ bitfield: 0n }, { bitfield: 8n })).toEqual(want);
    });

    test('treats a missing side as no permissions', () => {
        expect(permissionDiff(undefined, '8').gained).toEqual(['Administrator']);
    });
});
