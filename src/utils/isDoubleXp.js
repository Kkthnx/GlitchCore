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

module.exports = { isDoubleXpActive, getXpMultiplier };
