/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Calculates how much total XP is required to reach a specific level.
function xpRequiredForLevel(level) {
    return Math.floor(1.5 * (5 / 6) * level * (2 * level * level + 27 * level + 91));
}

module.exports = { xpRequiredForLevel };