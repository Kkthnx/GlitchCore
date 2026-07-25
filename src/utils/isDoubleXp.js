/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const config = require('../../config.json');
const { getLocalDay } = require('./time');

/**
 * Returns true if today is a double XP day (Friday or Saturday by default).
 * The day of week is evaluated in the community timezone (config.timezone),
 * NOT the host's local time — so a UTC server can't flip the flag early.
 *   0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
 */
function isDoubleXpActive() {
    return config.xpSettings.doubleXpDays.includes(getLocalDay());
}

/**
 * Returns the XP multiplier to apply. 2 on double XP days, 1 otherwise.
 */
function getXpMultiplier() {
    return isDoubleXpActive() ? config.xpSettings.doubleXpMultiplier : 1;
}

/**
 * True only on the FIRST day of a double XP streak (e.g. Friday when the window
 * is Fri+Sat). Used to gate the announcement so it fires once per weekend, not
 * on every double XP day. Evaluated in the community timezone.
 */
function isDoubleXpStartDay(today = getLocalDay()) {
    const days = config.xpSettings.doubleXpDays;
    const yesterday = (today + 6) % 7; // day-of-week before today
    return days.includes(today) && !days.includes(yesterday);
}

module.exports = { isDoubleXpActive, getXpMultiplier, isDoubleXpStartDay };
