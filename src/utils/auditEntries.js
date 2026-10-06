/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Turns a raw Discord audit log entry into readable log entries. Pure, so it
// can be tested with plain objects and no Discord connection.
//
// Only changes that matter to moderators are described. Everything else returns
// an empty list so the mod-log stays something people actually read.
const { AuditLogEvent: A, PermissionsBitField } = require('discord.js');
const { clamp } = require('./embedText');

const VALUE_MAX = 200;

// ── small formatters ─────────────────────────────────────────────────────────
function show(value) {
    if (value === null || value === undefined || value === '') return '(none)';
    if (Array.isArray(value)) return value.length ? value.map(show).join(', ') : '(none)';
    if (typeof value === 'object') return clamp(value.name ?? value.id ?? JSON.stringify(value), VALUE_MAX);
    return clamp(String(value), VALUE_MAX);
}

function find(entry, key) {
    return (entry.changes || []).find(c => c.key === key);
}

function unixOf(iso) {
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

function moderator(entry) {
    const id = entry.executor?.id ?? entry.executorId;
    return id ? `<@${id}>` : 'Unknown';
}

function userLabel(entry) {
    const id = entry.target?.id ?? entry.targetId;
    if (!id) return 'Unknown';
    const tag = entry.target?.tag || entry.target?.username;
    return tag ? `<@${id}> ${tag}` : `<@${id}>`;
}

function hex(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `#${n.toString(16).padStart(6, '0')}` : show(value);
}

function bits(value) {
    if (value && typeof value === 'object' && 'bitfield' in value) return BigInt(value.bitfield);
    try { return BigInt(value ?? 0); } catch { return 0n; }
}

// "ManageRoles" reads better as "Manage Roles".
function humanizePerm(name) {
    return name.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function permissionDiff(before, after) {
    const o = new PermissionsBitField(bits(before));
    const n = new PermissionsBitField(bits(after));
    return {
        gained: n.toArray().filter(p => !o.has(p)).map(humanizePerm),
        lost: o.toArray().filter(p => !n.has(p)).map(humanizePerm),
    };
}

// One "Label, before to after" line per change that is in the allowed set.
function diffLines(entry, labels, format = {}) {
    const lines = [];
    for (const [key, label] of Object.entries(labels)) {
        const c = find(entry, key);
        if (!c) continue;
        const fmt = format[key] || show;
        lines.push(`${label}, ${fmt(c.old)} to ${fmt(c.new)}`);
    }
    return lines;
}

// ── member actions ───────────────────────────────────────────────────────────
function memberAction(title, color) {
    return entry => [{
        title,
        color,
        fields: [
            { name: 'Member', value: userLabel(entry), inline: true },
            { name: 'Moderator', value: moderator(entry), inline: true },
            { name: 'Reason', value: entry.reason || 'No reason provided' },
        ],
    }];
}

function memberUpdate(entry) {
    const out = [];

    const timeout = find(entry, 'communication_disabled_until');
    if (timeout) {
        const until = timeout.new ? unixOf(timeout.new) : null;
        if (until) {
            out.push({
                title: 'MEMBER_TIMED_OUT',
                color: 'danger',
                fields: [
                    { name: 'Member', value: userLabel(entry), inline: true },
                    { name: 'Moderator', value: moderator(entry), inline: true },
                    { name: 'Until', value: `<t:${until}:F> (<t:${until}:R>)` },
                    { name: 'Reason', value: entry.reason || 'No reason provided' },
                ],
            });
        } else {
            out.push({
                title: 'TIMEOUT_REMOVED',
                color: 'success',
                fields: [
                    { name: 'Member', value: userLabel(entry), inline: true },
                    { name: 'Moderator', value: moderator(entry), inline: true },
                ],
            });
        }
    }

    const nick = find(entry, 'nick');
    if (nick) {
        out.push({
            title: 'NICKNAME_CHANGED',
            color: 'neutral',
            fields: [
                { name: 'Member', value: userLabel(entry), inline: true },
                { name: 'Changed by', value: moderator(entry), inline: true },
                { name: 'Before', value: show(nick.old), inline: true },
                { name: 'After', value: show(nick.new), inline: true },
            ],
        });
    }

    return out;
}

function memberRoleUpdate(entry) {
    const added = find(entry, '$add')?.new ?? [];
    const removed = find(entry, '$remove')?.new ?? [];
    if (!added.length && !removed.length) return [];

    const mention = roles => roles.map(r => `<@&${r.id}>`).join(' ');
    const fields = [
        { name: 'Member', value: userLabel(entry), inline: true },
        { name: 'Moderator', value: moderator(entry), inline: true },
    ];
    if (added.length) fields.push({ name: 'Added', value: mention(added) });
    if (removed.length) fields.push({ name: 'Removed', value: mention(removed) });

    return [{ title: 'ROLES_CHANGED', color: 'primary', fields }];
}

// ── channels ─────────────────────────────────────────────────────────────────
const CHANNEL_LABELS = {
    name: 'Name',
    topic: 'Topic',
    nsfw: 'Age restricted',
    rate_limit_per_user: 'Slowmode seconds',
};

function channelName(entry) {
    const c = find(entry, 'name');
    return c?.new ?? c?.old ?? entry.target?.name ?? entry.targetId ?? 'unknown';
}

function channelCreate(entry) {
    return [{
        title: 'CHANNEL_CREATED',
        color: 'success',
        fields: [
            { name: 'Channel', value: `<#${entry.targetId}> ${show(channelName(entry))}`, inline: true },
            { name: 'Moderator', value: moderator(entry), inline: true },
        ],
    }];
}

function channelDelete(entry) {
    return [{
        title: 'CHANNEL_DELETED',
        color: 'danger',
        fields: [
            { name: 'Channel', value: `#${show(channelName(entry))}`, inline: true },
            { name: 'Moderator', value: moderator(entry), inline: true },
        ],
    }];
}

function channelUpdate(entry) {
    const lines = diffLines(entry, CHANNEL_LABELS);
    if (!lines.length) return [];
    return [{
        title: 'CHANNEL_UPDATED',
        color: 'primary',
        fields: [
            { name: 'Channel', value: `<#${entry.targetId}>`, inline: true },
            { name: 'Moderator', value: moderator(entry), inline: true },
            { name: 'Changes', value: lines.join('\n') },
        ],
    }];
}

function overwriteChange(verb) {
    return entry => {
        const extra = entry.extra;
        const subject = extra?.name ?? extra?.role_name ?? extra?.user?.tag ?? extra?.id ?? 'unknown';
        return [{
            title: 'CHANNEL_PERMISSIONS_CHANGED',
            color: 'hype',
            fields: [
                { name: 'Channel', value: `<#${entry.targetId}>`, inline: true },
                { name: 'Moderator', value: moderator(entry), inline: true },
                { name: 'Change', value: `Permission override ${verb} for ${show(subject)}` },
            ],
        }];
    };
}

// ── roles ────────────────────────────────────────────────────────────────────
const ROLE_LABELS = {
    name: 'Name',
    color: 'Color',
    hoist: 'Shown separately',
    mentionable: 'Mentionable',
};

function roleName(entry) {
    const c = find(entry, 'name');
    return c?.new ?? c?.old ?? entry.target?.name ?? entry.targetId ?? 'unknown';
}

function roleCreate(entry) {
    return [{
        title: 'ROLE_CREATED',
        color: 'success',
        fields: [
            { name: 'Role', value: `<@&${entry.targetId}> ${show(roleName(entry))}`, inline: true },
            { name: 'Moderator', value: moderator(entry), inline: true },
        ],
    }];
}

function roleDelete(entry) {
    return [{
        title: 'ROLE_DELETED',
        color: 'danger',
        fields: [
            { name: 'Role', value: show(roleName(entry)), inline: true },
            { name: 'Moderator', value: moderator(entry), inline: true },
        ],
    }];
}

function roleUpdate(entry) {
    const lines = diffLines(entry, ROLE_LABELS, { color: hex });

    const perms = find(entry, 'permissions');
    if (perms) {
        const { gained, lost } = permissionDiff(perms.old, perms.new);
        if (gained.length) lines.push(`Permissions gained, ${gained.join(', ')}`);
        if (lost.length) lines.push(`Permissions lost, ${lost.join(', ')}`);
    }

    if (!lines.length) return [];
    return [{
        title: 'ROLE_UPDATED',
        color: perms ? 'hype' : 'primary',
        fields: [
            { name: 'Role', value: `<@&${entry.targetId}>`, inline: true },
            { name: 'Moderator', value: moderator(entry), inline: true },
            { name: 'Changes', value: lines.join('\n') },
        ],
    }];
}

// ── server and messages ──────────────────────────────────────────────────────
const GUILD_LABELS = {
    name: 'Server name',
    verification_level: 'Verification level',
    explicit_content_filter: 'Content filter',
    mfa_level: 'MFA requirement',
    owner_id: 'Owner',
    vanity_url_code: 'Vanity URL',
};

function guildUpdate(entry) {
    const lines = diffLines(entry, GUILD_LABELS, {
        owner_id: v => (v ? `<@${v}>` : '(none)'),
    });
    if (!lines.length) return [];
    return [{
        title: 'SERVER_UPDATED',
        color: 'hype',
        fields: [
            { name: 'Moderator', value: moderator(entry), inline: true },
            { name: 'Changes', value: lines.join('\n') },
        ],
    }];
}

function bulkDelete(entry) {
    const count = entry.extra?.count ?? '?';
    return [{
        title: 'MESSAGES_BULK_DELETED',
        color: 'danger',
        fields: [
            { name: 'Channel', value: `<#${entry.targetId}>`, inline: true },
            { name: 'Moderator', value: moderator(entry), inline: true },
            { name: 'Messages', value: String(count), inline: true },
        ],
    }];
}

const HANDLERS = {
    [A.MemberKick]: memberAction('MEMBER_KICKED', 'danger'),
    [A.MemberBanAdd]: memberAction('MEMBER_BANNED', 'danger'),
    [A.MemberBanRemove]: memberAction('MEMBER_UNBANNED', 'success'),
    [A.MemberUpdate]: memberUpdate,
    [A.MemberRoleUpdate]: memberRoleUpdate,
    [A.ChannelCreate]: channelCreate,
    [A.ChannelDelete]: channelDelete,
    [A.ChannelUpdate]: channelUpdate,
    [A.ChannelOverwriteCreate]: overwriteChange('added'),
    [A.ChannelOverwriteUpdate]: overwriteChange('changed'),
    [A.ChannelOverwriteDelete]: overwriteChange('removed'),
    [A.RoleCreate]: roleCreate,
    [A.RoleDelete]: roleDelete,
    [A.RoleUpdate]: roleUpdate,
    [A.GuildUpdate]: guildUpdate,
    [A.MessageBulkDelete]: bulkDelete,
};

/**
 * Describes an audit log entry as zero or more log entries. Unknown or
 * uninteresting actions return an empty list.
 *
 * @param {import('discord.js').GuildAuditLogsEntry} entry
 * @returns {{ title: string, color: string, fields: object[] }[]}
 */
function describeEntry(entry) {
    const handler = HANDLERS[entry.action];
    return handler ? handler(entry) : [];
}

module.exports = { describeEntry, permissionDiff };
