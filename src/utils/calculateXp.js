// Calculates how much total XP is required to reach a specific level.
function xpRequiredForLevel(level) {
    return Math.floor(1.5 * (5 / 6) * level * (2 * level * level + 27 * level + 91));
}

module.exports = { xpRequiredForLevel };