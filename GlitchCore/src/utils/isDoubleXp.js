const config = require('../../config.json');

/**
 * Returns true if today is a double XP day (Friday or Saturday by default).
 * Days are checked in the server's local time using JS getDay():
 *   0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
 */
function isDoubleXpActive() {
    const today = new Date().getDay();
    return config.xpSettings.doubleXpDays.includes(today);
}

/**
 * Returns the XP multiplier to apply. 2 on double XP days, 1 otherwise.
 */
function getXpMultiplier() {
    return isDoubleXpActive() ? config.xpSettings.doubleXpMultiplier : 1;
}

module.exports = { isDoubleXpActive, getXpMultiplier };
