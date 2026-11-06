/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// A misspelled COLORS or PALETTE key is undefined, and setColor(undefined)
// throws when the embed is built. The starboard shipped like that, so every
// post failed. This reads the source and checks each referenced key exists.

const fs = require('fs');
const path = require('path');
const { COLORS, PALETTE } = require('../src/utils/brand');

function listSourceFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return listSourceFiles(full);
        return entry.name.endsWith('.js') ? [full] : [];
    });
}

describe('brand color keys', () => {
    const files = listSourceFiles(path.join(__dirname, '..', 'src'));

    test.each([['COLORS', COLORS], ['PALETTE', PALETTE]])('every %s key used in src exists', (name, table) => {
        const pattern = new RegExp(`\\b${name}\\.(\\w+)`, 'g');
        const missing = [];
        for (const file of files) {
            const text = fs.readFileSync(file, 'utf8');
            for (const match of text.matchAll(pattern)) {
                if (!(match[1] in table)) missing.push(`${path.relative(process.cwd(), file)}: ${name}.${match[1]}`);
            }
        }
        expect(missing).toEqual([]);
    });

    test('every color is a number embeds accept', () => {
        for (const value of [...Object.values(COLORS), ...Object.values(PALETTE)]) {
            expect(Number.isInteger(value)).toBe(true);
        }
    });
});
