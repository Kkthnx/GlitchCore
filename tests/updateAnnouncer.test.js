/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { buildChangelog } = require('../src/utils/updateAnnouncer');

describe('buildChangelog', () => {
    test('renders each commit as a bullet', () => {
        const out = buildChangelog(['Fix a bug', 'Add a feature']);
        expect(out).toBe('- Fix a bug\n- Add a feature');
    });

    test('caps the list and summarizes the remainder', () => {
        const commits = Array.from({ length: 20 }, (_, i) => `change ${i + 1}`);
        const out = buildChangelog(commits);
        const lines = out.split('\n');
        expect(lines).toHaveLength(13); // 12 shown + 1 summary
        expect(lines[12]).toBe('- ...and 8 more changes');
    });

    test('singularizes the remainder line', () => {
        const commits = Array.from({ length: 13 }, (_, i) => `c${i}`);
        expect(buildChangelog(commits).split('\n').pop()).toBe('- ...and 1 more change');
    });

    test('truncates an over-long subject', () => {
        const out = buildChangelog(['x'.repeat(200)]);
        expect(out.length).toBeLessThanOrEqual(142);
        expect(out.endsWith('…')).toBe(true);
    });
});
