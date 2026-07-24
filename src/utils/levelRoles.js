// Pure helpers for the automated milestone level-role system. Kept free of
// Discord objects so the milestone math can be unit-tested directly.

/**
 * The milestone a member should currently hold at a given level — the highest
 * multiple of `interval` that is <= min(level, max). Returns 0 when the member
 * hasn't reached the first milestone or the feature is disabled.
 */
function currentMilestone(level, interval, max = Infinity) {
    if (!interval || interval < 1) return 0;
    const capped = Math.min(level, max);
    const milestone = Math.floor(capped / interval) * interval;
    return milestone >= interval ? milestone : 0;
}

/** Role name for a milestone, substituting {level} in the template. */
function roleNameFor(template, milestone) {
    return String(template || 'Level {level}').replace(/\{level\}/gi, String(milestone));
}

/**
 * A regex that matches any milestone role name produced by the template, so we
 * can find and strip superseded milestone roles when stacking is off.
 */
function milestoneNameRegex(template) {
    const parts = String(template || 'Level {level}')
        .split(/\{level\}/i)
        .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp('^' + parts.join('(\\d+)') + '$', 'i');
}

module.exports = { currentMilestone, roleNameFor, milestoneNameRegex };
