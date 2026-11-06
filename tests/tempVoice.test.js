/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

jest.mock('../src/database/TempVoiceSchema', () => ({
    create: jest.fn(),
    deleteOne: jest.fn(async () => ({})),
    updateOne: jest.fn(async () => ({})),
    find: jest.fn(),
}));
jest.mock('../src/utils/guildConfigCache', () => ({ getGuildConfig: jest.fn(async () => ({})) }));

const { PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const {
    cleanChannelName,
    defaultLobbyName,
    missingPermissions,
    consumeCreate,
    consumeRename,
    CREATE_COOLDOWN_MS,
} = require('../src/utils/tempVoiceManager');

describe('cleanChannelName', () => {
    test('strips control characters and collapses spacing', () => {
        expect(cleanChannelName('  Ranked\n​  grind\t ')).toBe('Ranked grind');
    });

    test('caps the length at Discord limit', () => {
        expect(cleanChannelName('x'.repeat(300))).toHaveLength(100);
    });

    test('returns an empty string for nothing usable', () => {
        expect(cleanChannelName('​​ ')).toBe('');
        expect(cleanChannelName(null)).toBe('');
    });
});

describe('defaultLobbyName', () => {
    test('uses the display name', () => {
        expect(defaultLobbyName('Kkthnx')).toBe("Kkthnx's Lobby");
    });

    test('falls back when the name is empty', () => {
        expect(defaultLobbyName('')).toBe('Glitch Lobby');
    });

    test('falls back when the display name trips the filter', () => {
        expect(defaultLobbyName('Trump fan')).toBe('Glitch Lobby');
    });
});

describe('missingPermissions', () => {
    test('reports every permission when none are known', () => {
        expect(missingPermissions(null)).toEqual(['ViewChannel', 'Connect', 'ManageChannels', 'MoveMembers']);
    });

    test('lists only what is absent', () => {
        const perms = new PermissionsBitField([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ManageChannels,
        ]);
        expect(missingPermissions(perms)).toEqual(['MoveMembers']);
    });

    test('is empty when the bot has all of them', () => {
        const perms = new PermissionsBitField([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
        ]);
        expect(missingPermissions(perms)).toEqual([]);
    });
});

describe('consumeCreate', () => {
    test('blocks a second create inside the cooldown, then allows it', () => {
        const store = new Map();
        expect(consumeCreate('g', 'u', 1000, store)).toBe(true);
        expect(consumeCreate('g', 'u', 1000 + CREATE_COOLDOWN_MS - 1, store)).toBe(false);
        expect(consumeCreate('g', 'u', 1000 + CREATE_COOLDOWN_MS, store)).toBe(true);
    });

    test('tracks members separately', () => {
        const store = new Map();
        expect(consumeCreate('g', 'a', 0, store)).toBe(true);
        expect(consumeCreate('g', 'b', 0, store)).toBe(true);
    });
});

describe('consumeRename', () => {
    const MIN = 60 * 1000;

    test('allows two renames per ten minutes, then refuses', () => {
        const store = new Map();
        expect(consumeRename('c', 0, store)).toBe(true);
        expect(consumeRename('c', 1 * MIN, store)).toBe(true);
        expect(consumeRename('c', 2 * MIN, store)).toBe(false);
    });

    test('frees a slot once the oldest rename ages out', () => {
        const store = new Map();
        consumeRename('c', 0, store);
        consumeRename('c', 1 * MIN, store);
        expect(consumeRename('c', 10 * MIN, store)).toBe(true);
    });
});
