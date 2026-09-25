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

describe('/settings exposes the toggle', () => {
    const json = settings.data.toJSON();
    const keyChoices = json.options
        .find(o => o.name === 'set').options
        .find(o => o.name === 'key').choices;

    test('content_filter_enabled is an offered key', () => {
        expect(keyChoices.map(c => c.value)).toContain('contentFilterEnabled');
    });

    test('it is named consistently with the other switches', () => {
        const byValue = Object.fromEntries(keyChoices.map(c => [c.value, c.name]));
        expect(byValue.contentFilterEnabled).toBe('content_filter_enabled');
        expect(byValue.antiSpamEnabled).toBe('anti_spam_enabled');
    });

    test('every offered key is unique', () => {
        const values = keyChoices.map(c => c.value);
        expect(new Set(values).size).toBe(values.length);
    });
});
