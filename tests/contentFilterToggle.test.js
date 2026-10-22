/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// The filter used to run unconditionally. Adding a switch is only safe if the
// default keeps it on, and if "unset" reads as on rather than off.

const settings = require('../src/commands/settings');

// Mirrors the gate in messageCreate: only an explicit false turns it off.
const filterEnabled = cfg => cfg.contentFilterEnabled !== false;

describe('contentFilterEnabled gate', () => {
    test('a guild with no config at all keeps the filter on', () => {
        expect(filterEnabled({})).toBe(true);
    });

    test('a guild that has never touched the setting keeps it on', () => {
        expect(filterEnabled({ contentFilterEnabled: undefined })).toBe(true);
    });

    test('only an explicit false turns it off', () => {
        expect(filterEnabled({ contentFilterEnabled: false })).toBe(false);
        expect(filterEnabled({ contentFilterEnabled: true })).toBe(true);
    });
});

describe('/settings offers the toggle', () => {
    // The key option moved from a fixed choice list to autocomplete (Discord
    // caps choices at 25 and the list outgrew it), so these tests drive the
    // autocomplete handler instead of reading .choices off the option.
    async function offeredKeys(focused) {
        const seen = [];
        await settings.autocomplete({
            options: { getFocused: () => focused },
            respond: async (items) => { seen.push(...items); },
        });
        return seen;
    }

    test('contentFilterEnabled is offered', async () => {
        const keys = await offeredKeys('content_filter');
        expect(keys.map(k => k.value)).toContain('contentFilterEnabled');
    });

    test('the new moderation keys are offered', async () => {
        const keys = await offeredKeys('strike');
        const values = keys.map(k => k.value);
        expect(values).toContain('strikeWarnThreshold');
        expect(values).toContain('strikeAction');
        expect(values).toContain('strikeTimeoutMinutes');
    });

    test('every offered key is unique', async () => {
        const keys = await offeredKeys('');
        const values = keys.map(k => k.value);
        expect(new Set(values).size).toBe(values.length);
    });
});
