// Pure RSVP + time-parsing logic for game-night events. No Discord objects, so
// the roster mechanics (waitlist promotion, capacity) are unit-testable.
const { parseDuration } = require('./duration');
const { zonedWallTimeToDate } = require('./time');

/**
 * Apply an RSVP choice to the three rosters, returning fresh arrays.
 * `member` is { userId, username }; `choice` is 'going' | 'maybe' | 'decline'.
 * Capacity > 0 caps the going list and spills to the waitlist; when a going
 * slot frees up, the front of the waitlist is auto-promoted.
 * @returns {{ going, maybe, waitlist, promoted: string[], status: string }}
 */
function applyRsvp(lists, member, choice, capacity = 0) {
    const without = arr => (arr || []).filter(m => m.userId !== member.userId);
    let going = without(lists.going);
    let maybe = without(lists.maybe);
    let waitlist = without(lists.waitlist);

    let status = 'removed';
    if (choice === 'going') {
        if (capacity > 0 && going.length >= capacity) {
            waitlist.push(member);
            status = 'waitlisted';
        } else {
            going.push(member);
            status = 'going';
        }
    } else if (choice === 'maybe') {
        maybe.push(member);
        status = 'maybe';
    }

    // Promote from the waitlist if the going list has room.
    const promoted = [];
    if (capacity > 0) {
        while (going.length < capacity && waitlist.length > 0) {
            const next = waitlist.shift();
            going.push(next);
            promoted.push(next.userId);
        }
    }

    return { going, maybe, waitlist, promoted, status };
}

/**
 * Parse a start time. Accepts a relative duration ("2h", "90m", "1d") meaning
 * "from now", or an absolute "YYYY-MM-DD HH:mm" in the community timezone.
 * @returns {Date|null}
 */
function parseStartTime(input, now = Date.now()) {
    if (!input) return null;
    const relative = parseDuration(input);
    if (relative) return new Date(now + relative);
    const absolute = zonedWallTimeToDate(input);
    if (absolute && absolute.getTime() > now) return absolute;
    return absolute || null;
}

module.exports = { applyRsvp, parseStartTime };
