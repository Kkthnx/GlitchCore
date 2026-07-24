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

/**
 * Offset (ms) between the community timezone and UTC at a given instant,
 * accounting for DST. Positive east of UTC.
 */
function tzOffsetMs(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(date).reduce((acc, p) => {
        acc[p.type] = p.value;
        return acc;
    }, {});
    const asUtc = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
    );
    return asUtc - date.getTime();
}

/**
 * Convert a wall-clock time in the community timezone to a UTC Date.
 * Accepts "YYYY-MM-DD HH:mm" (or with a "T" separator).
 * @returns {Date|null}
 */
function zonedWallTimeToDate(input) {
    const m = String(input).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
    if (!m) return null;
    const [, y, mo, d, h, mi] = m.map(Number);
    if (h > 23 || mi > 59 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;

    // Interpret the wall time as UTC, then subtract the zone's offset at that
    // instant to land on the correct UTC moment.
    const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
    const offset = tzOffsetMs(new Date(utcGuess));
    return new Date(utcGuess - offset);
}

module.exports = {
    TIMEZONE,
    getLocalDateString,
    getLocalDay,
    getLocalDayName,
    msUntilNextLocalMidnight,
    tzOffsetMs,
    zonedWallTimeToDate,
};
