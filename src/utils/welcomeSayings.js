/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Random flavor for new-member welcomes. Headlines are short punchy titles,
// quips are the sly one-liners under the welcome.
module.exports = {
    headlines: [
        'A new challenger appears',
        'A wild gamer appeared',
        'Fresh spawn detected',
        'The squad just got bigger',
        'Someone found the door',
        'New player connected',
        'Reinforcements have arrived',
        'We have a live one',
        'Player count going up',
        'A new legend enters the arena',
    ],
    quips: [
        'Grab a controller and pretend you know what you are doing.',
        'You are legally required to say gg at least once.',
        'Try not to rage quit on day one.',
        'We needed one more for the lobby, perfect timing.',
        'Hope you brought snacks, this is gonna be a long one.',
        'No lurking allowed, you have to say something eventually.',
        'Your roles are showing, go grab some with /roles.',
        'Loading personality, please wait.',
        'Spawned in with full HP and zero context.',
        'The wifi gods blessed us with your presence.',
        'Another victim for game night, welcome aboard.',
        'We promise the vibes are mostly immaculate.',
        'You unlocked the secret ending, joining Glitch Haven.',
        'No refunds, you live here now.',
        'Touch grass later, say hi first.',
        'The prophecy said you would arrive, and here you are.',
        'Warning, this server is highly addictive.',
        'You made it past the loading screen, congrats.',
        'Pull up a chair and drop your best meme.',
        'Statistically you will lag at the worst moment, we understand.',
        'Every good squad needs a wildcard, so welcome.',
        'You are part of the glitch now, resistance is futile.',
        'Achievement unlocked, joined the coolest server around.',
        'We saved you a seat and a spare controller.',
        'Do not feed the mods after midnight.',
    ],
    // Sly one-liners for when someone leaves.
    farewells: [
        'Rage quit confirmed.',
        'One less player in the lobby.',
        'They disconnected from the mainframe.',
        'Ejected into the void.',
        'Ran out of lives.',
        'The prophecy did not include a sequel.',
        'Ghosted the whole server, bold move.',
        'Logged off for the last time.',
        'Went to touch grass and never returned.',
        'Their signal faded into static.',
        'Uninstalled from Glitch Haven.',
        'Left the party without saying gg.',
        'Respawn point not found.',
        'Went AFK permanently.',
        'The glitch reclaimed one of its own.',
    ],
    pick(list) {
        return list[Math.floor(Math.random() * list.length)];
    },
};
