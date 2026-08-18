/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { capChanges, buildPatchBlock } = require('../src/utils/updateAnnouncer');

describe('capChanges', () => {
    test('returns each commit subject unchanged when short', () => {
        expect(capChanges(['Fix a bug', 'Add a feature'])).toEqual(['Fix a bug', 'Add a feature']);
    });

    test('caps the list and summarizes the remainder', () => {
        const commits = Array.from({ length: 20 }, (_, i) => `change ${i + 1}`);
        const out = capChanges(commits);
        expect(out).toHaveLength(13); // 12 shown + 1 summary
        expect(out[12]).toBe('...and 8 more changes');
    });

    test('singularizes the remainder line', () => {
        const commits = Array.from({ length: 13 }, (_, i) => `c${i}`);
        expect(capChanges(commits).pop()).toBe('...and 1 more change');
    });

    test('truncates an over-long subject', () => {
        const [line] = capChanges(['y'.repeat(200)]);
        expect(line.length).toBeLessThanOrEqual(140);
        expect(line.endsWith('…')).toBe(true);
    });
});

describe('buildPatchBlock', () => {
    test('wraps the readout in an ansi code block with build info', () => {
        const block = buildPatchBlock(['Fix a bug'], { commit: 'abc1234', branch: 'main' });
        expect(block.startsWith('```ansi')).toBe(true);
        expect(block.endsWith('```')).toBe(true);
        expect(block).toContain('abc1234');
        expect(block).toContain('Fix a bug');
    });
});
