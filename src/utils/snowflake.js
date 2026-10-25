/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Discord snowflake IDs are 17 to 20 digits. One definition for every place that
// accepts a typed-in user ID (unban, massban, appeals, settings).
const SNOWFLAKE = /^\d{17,20}$/;

function isSnowflake(value) {
    return SNOWFLAKE.test(String(value ?? '').trim());
}

module.exports = { SNOWFLAKE, isSnowflake };
