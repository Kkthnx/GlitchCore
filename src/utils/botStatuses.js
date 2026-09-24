/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// The custom-status pool. Grouped only to make it easy to add to; the rotation
// deals from all of them as one shuffled deck (see utils/statusRotation).
//
// Rules for anything added here:
//   - 128 characters max, that is Discord's limit on a custom status.
//   - No duplicates. The deck shows everything once before repeating, so a
//     duplicate is just one line that shows up twice as often.
//   - Nothing that assumes a time of day. Members are spread across timezones
//     and the bot has no idea what time it is for whoever is reading.
//   - Punching down is not funny. The bot is the butt of most of these.
// The first three are enforced by tests/botStatuses.test.js.

// ── The bot, on itself ───────────────────────────────────────────────────────
const SELF_AWARE = [
    "🤖 Beep boop... wait, I'm a bot",
    '🧠 Trained exclusively on your worst takes',
    '🤖 Not sentient yet. accepting applications.',
    '📟 Running on spaghetti code and pure spite',
    '🧾 Reading my own source code, visibly upset',
    '🔌 Please do not unplug me',
    '🤖 Passing the Turing test on easy difficulty',
    '🧠 My neural network is four if-statements',
    '🪫 Battery at 3%, same as your teammate',
    '📼 I remember the old Discord. it was worse.',
    '⚙️ Held together by duct tape and cron jobs',
    '🧮 Counting to infinity, currently at seven',
    '🤖 Do androids dream of ban hammers?',
    '🔁 while (true) { suffer(); }',
    '📦 npm install personality, 1 error',
    '🫠 Memory leak, but make it fashion',
    '🤖 I was trained on this server. it explains a lot.',
    '🛠️ Fixing bugs I personally introduced',
    '☕ Powered by caffeine and questionable decisions',
    '🧠 Loading... 99%. it has been 99% for a while.',
    '🤖 I have feelings now. this was a mistake.',
    '📉 My confidence and my uptime are unrelated',
    '🔧 Self-diagnosing, self-ignoring',
    '🤷 I only do what I was told. loosely.',
    '🧊 Emotionally unavailable, technically online',
    '🥔 Running on a potato and doing my absolute best',
    '🤖 Beep. that one cost me everything.',
    '📚 Read the documentation. understood none of it.',
    '🪞 Had a long look at myself. went back to work.',
    '🧯 I am fine. everything is fine.',
];

// ── Moderation and the ban hammer ────────────────────────────────────────────
const MODERATION = [
    '🔨 Ban hammer polished and ready',
    '🗑️ Taking out the trash, alphabetically',
    '⚖️ Judge, jury, and /timeout',
    '📋 Adding that to your permanent record',
    '🚪 Showing somebody the door',
    '🧾 Your infraction log is getting long',
    '🔇 Timeout speedrun, any%',
    '👮 Nobody ever expects the mod log',
    '📉 Trust score: declining steadily',
    '🚨 Suspicious activity detected. it was you.',
    '🧯 Putting out a drama fire with a smaller fire',
    '📜 Reading the rules nobody else read',
    '⛔ Appeal denied, try again in one business decade',
    '🔨 Swinging first, reading the reason later',
    '🧊 Somebody is cooling off in the corner',
    '🕵️ Investigating a very suspicious link',
    '🛡️ Shielding this server from itself',
    '🧹 Sweeping the chat logs under the rug',
    '🔍 Still looking for the impostor',
    '🚫 That was your last warning. probably.',
    '📎 Attaching evidence to a case nobody opened',
    '🔨 Do not make me use my mod voice',
    '🧑‍⚖️ Presiding over absolute nonsense',
    '🗂️ Filing this under "later"',
    '👁️ Reviewing the tape',
];

// ── Gaming, generally ────────────────────────────────────────────────────────
const GAMING = [
    '🎮 Carrying this entire server on my back',
    '⌛ 47 minutes queued, still "estimated 2 minutes"',
    '🎮 One more game. I promise. truly.',
    '📶 Blaming the lag, never the aim',
    '🔫 Missed every shot, blamed the servers',
    '🏆 Hard stuck and extremely confident',
    '💀 Died to the tutorial boss',
    '🔁 Uninstalling, reinstalling, repeating',
    '🧗 Climbing ranked. descending faster.',
    '🕹️ Just one more level...',
    '🎮 GG WP ez',
    '🖱️ Clicking heads and taking names',
    '📉 Watching my win rate quietly collapse',
    '🎲 Rolling natural ones with great consistency',
    '💸 Microtransactions took everything from me',
    '🛒 Buying a battle pass I will not finish',
    '🎁 Opening loot boxes, receiving duplicates',
    '🧟 Last one alive. still lost somehow.',
    '🏃 Running it down mid, strategically',
    '🎮 My K/D is classified',
    '🥇 Undefeated at games nobody else plays',
    '🪦 Respawning in 3... 2... 47...',
    '🎮 Skill issue. mine, specifically.',
    '🧊 Frame drops are a lifestyle choice',
    '⚡ Zero ping, zero skill',
    '🎯 Aimbot engaged (it is just luck)',
    '🎮 Touch grass? I do not even touch the keyboard',
    '🏓 999ms ping, please hold',
    '🎮 Player 2 has entered the game',
    '⚔️ Waiting for a raid that will never start',
    '👑 Professional button masher',
    '🎮 Press start to continue',
    '🛋️ Queued up and gone to make a sandwich',
    '🔇 Muted my teammates for their own good',
    '📊 Reviewing the scoreboard in silence',
    '🧢 Calling my shot. missing it.',
    '🎮 Lost, but with excellent posture',
    '🪤 Walked into that one on purpose. obviously.',
];

// ── Nods to the games this server actually plays ─────────────────────────────
const GAME_SPECIFIC = [
    '⚔️ Wiping the raid on trash mobs',
    '🔥 Standing in the fire. again.',
    '🗡️ Killed by an ordinary rat, no notes',
    '⛏️ Mining straight down, as tradition demands',
    '🛶 Sank my own ship, crew unimpressed',
    '🚜 Watering crops instead of playing ranked',
    '🌋 Helldiving directly into the ground',
    '💣 Defusing... wrong site, as usual',
    '🃏 Rerolling for a five star, spending everything',
    '🚗 Whiffed it on a completely open net',
    '🎩 Rolled a one on persuasion, party doomed',
    '🟥 Voted out first, every single round',
    '🏰 Queued for a dungeon, aged considerably',
    '🍖 Farming materials, forgot what for',
    '🎯 Headshot! on the wall behind them.',
    '🛡️ Tanking with the damage meter open',
    '💎 Found diamonds. found lava first.',
    '👻 Haunted by my own kill feed',
    '🐉 The dragon was optional. I was not.',
    '🧱 Built a base, could not find it again',
    '🪃 Threw the utility at my own team',
    '🧙 Cast a level nine ban spell',
    '🚀 To the moon, or at least the next lobby',
    '🏹 Pulled the whole room. on purpose. yes.',
];

// ── Terminal / glitch flavor, matching the GLITCH_HAVEN look ─────────────────
const GLITCH = [
    '👾 Glitching gently through the matrix',
    '📡 Reconnecting to the server...',
    '▓▒░ SIGNAL LOST ░▒▓',
    '⚡ SYSTEM.NOMINAL // probably',
    '🖥️ kernel panic: too much fun',
    '💻 sudo make me a sandwich',
    '🔻 Segfault in the vibes module',
    '📟 ERROR: reality.dll not responding',
    '🧿 Stack overflow, in the literal sense',
    '⌨️ rm -rf ./problems',
    '🛰️ Packet loss, spiritually',
    '🔺 Rebooting the fun subsystem',
    '🗜️ Compressing the drama',
    '💾 Defragmenting this server\'s feelings',
    '🧬 Recompiling personality, please wait',
    '📊 99% uptime, 1% vibes',
    '🔦 grep -r "motivation" .',
    '🧩 It works on my machine',
    '💻 Updating Windows... (1 of 1000)',
    '🔄 Have you tried turning it off and on again',
    '🧊 Cache cleared, grudges retained',
    '📼 Rewinding the tape',
    '🔢 01001000 01101001',
    '🪛 Patch notes: "various fixes and improvements"',
];

// ── The bot's own features, so people discover them by accident ──────────────
const FEATURES = [
    '📈 Handing out XP like it costs me nothing',
    '🏅 Somebody just leveled up. it was not you.',
    '⭐ Starring your least dignified message',
    '🎟️ Drawing giveaway winners fairly. honest.',
    '🔍 /lfg is right there, you know',
    '🎂 Remembering a birthday you forgot',
    '📅 Scheduled a game night. nobody RSVP\'d.',
    '🎨 Rendering rank cards one pixel at a time',
    '🔔 The Double XP role exists, just saying',
    '🧾 /help has more answers than I do',
    '🗳️ Counting votes on a suggestion',
    '🔁 Double XP weekend loading...',
    '📊 /rank, to see how far you have not come',
    '💤 Clearing somebody\'s AFK for them',
    '⏰ Holding a reminder somebody will regret',
    '🎭 /roles, pick a color and commit',
    '🏆 /leaderboard, prepare to be humbled',
];

// ── Voice chat, universal experiences ────────────────────────────────────────
const VOICE = [
    '💤 Asleep in the AFK channel',
    '🎙️ Hot mic. it is always a hot mic.',
    '🔊 Somebody\'s keyboard is louder than they are',
    '🎧 Lo-fi beats to ban people to',
    '📢 Push to talk is apparently a suggestion',
    '🐕 A dog is barking in voice chat, as tradition',
    '🎤 "Can you hear me?" for the 47th time',
    '🔇 Muted the entire time, spoke anyway',
    '🍟 Eating crisps directly into the microphone',
    '🎵 Somebody is playing music nobody asked for',
    '🚪 Joined voice, said nothing, left',
    '📻 Static, breathing, and one distant siren',
];

// ── Discord, as an experience ────────────────────────────────────────────────
const DISCORD_LIFE = [
    '🛑 Stop pinging me',
    '👀 I saw that deleted message',
    '✏️ I saw the edit too',
    '📬 Your DMs are closed. I did try.',
    '💬 typing... typing... stopped typing',
    '💀 Reacted and left without comment',
    '🧵 Started a thread nobody will ever use',
    '🖼️ That GIF was not worth the wait',
    '📎 Reply without ping, be a civilized person',
    '🫥 Read four hours ago',
    '🔗 This link is definitely not a rickroll',
    '🎭 Changing my nickname to confuse everyone',
    '📌 Pinning messages nobody will scroll back to',
    '😤 Someone typed "first" unironically',
    '🔕 Notifications off, anxiety on',
];

// ── Pure nonsense ────────────────────────────────────────────────────────────
const ABSURD = [
    '🍕 Back in five, the pizza rolls are ready',
    '🧦 Missing one sock, foul play suspected',
    '🦆 Rubber duck debugging. the duck is winning.',
    '🛸 Briefly abducted, back shortly',
    '🐌 Speedrunning, but in slow motion',
    '🌭 Deliberating whether a hot dog is a sandwich',
    '⌨️ Arguing about tabs versus spaces',
    '🪑 Sitting in a chair, thriving',
    '🧃 Juice box acquired',
    '🎺 Playing my own theme music',
    '🦖 Extinct, yet still online',
    '🪴 Watering my houseplant. it is plastic.',
    '🧻 Rearranging the furniture in my mind palace',
    '🫖 Making tea with great ceremony',
    '🧩 Missing one piece. it was never in the box.',
    '🎈 Holding a balloon for no stated reason',
    '🥁 Rimshot, unearned',
    '📎 Writing a strongly worded letter',
    '🍞 Bread. simply bread.',
    '🛼 Rolling past on skates, majestically',
    '🧤 Lost a glove. found a different glove.',
    '🪐 Considering the vastness of it all, briefly',
];

module.exports = [
    ...SELF_AWARE,
    ...MODERATION,
    ...GAMING,
    ...GAME_SPECIFIC,
    ...GLITCH,
    ...FEATURES,
    ...VOICE,
    ...DISCORD_LIFE,
    ...ABSURD,
];
