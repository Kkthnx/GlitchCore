/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { BANNER_CHOICES, bannerFileForKey, bannerBlurbForKey, bannerAttachment } = require('../src/utils/eventBanners');

describe('event banners', () => {
    test('exposes a choice per bundled banner', () => {
        const values = BANNER_CHOICES.map(c => c.value);
        expect(values).toContain('friday-night-gaming');
        expect(values).toContain('saturday-night-gaming');
    });

    test('resolves a known key to its file and blurb', () => {
        expect(bannerFileForKey('friday-night-gaming')).toBe('friday-night-gaming.png');
        expect(typeof bannerBlurbForKey('friday-night-gaming')).toBe('string');
        expect(bannerBlurbForKey('friday-night-gaming').length).toBeGreaterThan(0);
    });

    test('returns null for an unknown or missing key', () => {
        expect(bannerFileForKey('nope')).toBeNull();
        expect(bannerBlurbForKey(null)).toBeNull();
    });

    test('builds an attachment only when the file exists', () => {
        expect(bannerAttachment('friday-night-gaming.png')).not.toBeNull();
        expect(bannerAttachment('does-not-exist.png')).toBeNull();
        expect(bannerAttachment(null)).toBeNull();
    });
});
