const config = require('../../config.json');

// The single source of truth for "what day/time is it for the community".
// Every double-XP decision, announcement, and dedup key is computed in this
// timezone so the server's host timezone (often UTC) can never make the bot
// post a day early or re-announce after a restart.
const TIMEZONE = config.timezone || 'America/New_York';

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Calendar date (YYYY-MM-DD) in the community timezone.
 * Used as the dedup key so restarts within the same local day stay silent.
 */
function getLocalDateString(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

/**
 * Day of week in the community timezone. 0 = Sunday ... 6 = Saturday,
 * matching JS Date#getDay() so existing config (doubleXpDays) keeps working.
 */
function getLocalDay(date = new Date()) {
    const short = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        weekday: 'short',
    }).format(date);
    return WEEKDAY_INDEX[short];
}

/**
 * Full weekday name (e.g. "Friday") in the community timezone.
 */
function getLocalDayName(date = new Date()) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        weekday: 'long',
    }).format(date);
}

/**
 * Milliseconds until the next midnight in the community timezone.
 * DST days are ~1h off, but the midnight scheduler re-arms and the
 * date-string dedup guarantees at most one announcement per local day.
 */
function msUntilNextLocalMidnight(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(date).reduce((acc, p) => {
        acc[p.type] = p.value;
        return acc;
    }, {});

    const hour = parseInt(parts.hour, 10) % 24; // some engines emit "24" at midnight
    const minute = parseInt(parts.minute, 10);
    const second = parseInt(parts.second, 10);

    const elapsedMs = ((hour * 60 + minute) * 60 + second) * 1000 + date.getMilliseconds();
    const dayMs = 24 * 60 * 60 * 1000;
    return dayMs - elapsedMs;
}

module.exports = {
    TIMEZONE,
    getLocalDateString,
    getLocalDay,
    getLocalDayName,
    msUntilNextLocalMidnight,
};
