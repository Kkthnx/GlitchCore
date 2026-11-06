/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// A misspelled enum member such as PermissionFlagsBits.ManageRole is undefined.
// It fails quietly until the line runs, and then as a vague validation error or a
// permission check that is always false. This reads the source and checks every
// member of the discord.js enums the bot uses against the installed library.

const fs = require('fs');
const path = require('path');
const discord = require('discord.js');

const ENUMS = [
    'PermissionFlagsBits', 'ChannelType', 'ButtonStyle', 'MessageFlags', 'ActivityType',
    'InteractionContextType', 'TextInputStyle', 'AuditLogEvent', 'GatewayIntentBits',
    'Partials', 'ComponentType', 'OverwriteType', 'ApplicationCommandOptionType',
];

function listSourceFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return listSourceFiles(full);
        return entry.name.endsWith('.js') ? [full] : [];
    });
}

const files = [
    ...listSourceFiles(path.join(__dirname, '..', 'src')),
    ...listSourceFiles(path.join(__dirname, '..', 'scripts')),
];

describe('discord.js enum members used in the bot', () => {
    test.each(ENUMS)('every %s member exists', (name) => {
        const table = discord[name];
        const pattern = new RegExp(`\\b${name}\\.(\\w+)`, 'g');
        const missing = [];
        for (const file of files) {
            const text = fs.readFileSync(file, 'utf8');
            for (const match of text.matchAll(pattern)) {
                if (table === undefined || !(match[1] in table)) {
                    missing.push(`${path.relative(process.cwd(), file)}: ${name}.${match[1]}`);
                }
            }
        }
        expect(missing).toEqual([]);
    });

    test('permission names passed as strings are real flags', () => {
        const pattern = /permissions?\.(?:has|missing)\(\s*'(\w+)'/g;
        const missing = [];
        for (const file of files) {
            const text = fs.readFileSync(file, 'utf8');
            for (const match of text.matchAll(pattern)) {
                if (!(match[1] in discord.PermissionFlagsBits)) {
                    missing.push(`${path.relative(process.cwd(), file)}: '${match[1]}'`);
                }
            }
        }
        expect(missing).toEqual([]);
    });
});
