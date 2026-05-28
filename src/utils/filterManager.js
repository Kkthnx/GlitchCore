// Expanded Filter Definitions using word boundaries to prevent false positives (e.g., 'spice' triggering 'spic')
const politicalRegex = /\b(trump|biden|obama|hillary|kamala|pelosi|mcconnell|democrat|republican|libtard|conservatard|maga|antifa|qanon|alt-right|proud boys|leftist|right-wing|fascist|marxist)\b/i;

const racistRegex = /\b(nigger|nigga|n1gga|n1gger|nibba|faggot|fag|tranny|shemale|dyke|chink|gook|zipperhead|spic|wetback|beaner|kike|kyke|towelhead|camel jockey|sand nigger|porch monkey|jigaboo|coon|retard)\b/i;

const analRegex = /\banal\b/i;

// Regex matching Chinese Hanzi, Japanese Kanji/Kana, and Korean Hangul
const cjkRegex = /[\u2E80-\u2FD5\u3190-\u319f\u3400-\u4DBF\u4E00-\u9FCC\uF900-\uFAAD\u3041-\u3096\u30A0-\u30FF\uAC00-\uD7AF\u1100-\u11FF]/;

const clapbacks = [
    "Nice try, {user}, but we don't do that here. Go back to Twitter! 🤡",
    "Did you really think that was gonna work, {user}? Straight to the shadow realm. 🔨",
    "{user} just tried to bypass the filter. Everyone point and laugh! 🫵😂",
    "Mods, twist {user}'s testicles counter-clockwise. 🧙‍♂️",
    "We caught that in 4K, {user}. Not in this server. 📸",
    "Yikes, {user}... maybe take a walk outside? 🌿",
    "{user}'s message was so bad it made the auto-mod throw up. 🤮",
    "Error 404: Braincells not found for {user}. 🤖"
];

function checkMessage(content) {
    // Check Politics
    if (politicalRegex.test(content)) {
        return 'American Politics';
    }

    // Check Racism
    if (racistRegex.test(content)) {
        return 'Racism/Slurs';
    }

    // Check Anal Spam
    if (analRegex.test(content)) {
        return '"Anal" Spammer';
    }

    // Check CJK
    if (cjkRegex.test(content)) {
        return 'Chinese/Korean/Japanese Characters';
    }

    return null;
}

function getRandomClapback(userMention) {
    const index = Math.floor(Math.random() * clapbacks.length);
    return clapbacks[index].replace('{user}', userMention);
}

module.exports = {
    checkMessage,
    getRandomClapback
};
