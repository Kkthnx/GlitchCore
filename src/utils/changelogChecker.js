const cron = require('node-cron');
const cheerio = require('cheerio');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');
const BotState = require('../database/BotStateSchema');

// The specific channel ID provided by the user
const CHANNEL_ID = '1354283517105930241';
const CHANGELOG_URL = 'https://firestorm-servers.com/en/changelog/tww';

/**
 * Creates a unique hash for a changelog item based on title and date.
 * We avoid hashing the raw HTML description as it may contain dynamic tokens causing reposts.
 */
function createChangelogHash(title, date) {
    // Normalize to the UTC day (midnight) so the hash is stable across all cron
    // runs within the same day. Using the raw Date object was millisecond-precise
    // and would differ on every run, causing the same entry to get a new hash.
    const dayKey = date instanceof Date
        ? `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`
        : String(date);
    return crypto.createHash('sha256').update(`${title}||${dayKey}`).digest('hex');
}

// Priority order within categoryInfo: entries listed with higher specificity (dungeon names,
// specific events) are preferred when multiple tags match because we check title tags first.
const categoryInfo = {
    // --- Classes ---
    warrior:      { name: 'Warrior',      emoji: '⚔️',  color: '#C69B6D', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_warrior.jpg' },
    paladin:      { name: 'Paladin',      emoji: '🛡️',  color: '#F48CBA', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_paladin.jpg' },
    hunter:       { name: 'Hunter',       emoji: '🏹',  color: '#ABD473', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_hunter.jpg' },
    rogue:        { name: 'Rogue',        emoji: '🗡️',  color: '#FFF468', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_rogue.jpg' },
    priest:       { name: 'Priest',       emoji: '✨',  color: '#D8D8D8', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_priest.jpg' },
    dk:           { name: 'Death Knight', emoji: '💀',  color: '#C41E3A', icon: 'https://wow.zamimg.com/images/wow/icons/large/spell_deathknight_classicon.jpg' },
    deathknight:  { name: 'Death Knight', emoji: '💀',  color: '#C41E3A', icon: 'https://wow.zamimg.com/images/wow/icons/large/spell_deathknight_classicon.jpg' },
    shaman:       { name: 'Shaman',       emoji: '⚡',  color: '#2459FF', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_shaman.jpg' },
    mage:         { name: 'Mage',         emoji: '🔵',  color: '#3FC7EB', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_mage.jpg' },
    warlock:      { name: 'Warlock',      emoji: '🔮',  color: '#8788EE', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_warlock.jpg' },
    monk:         { name: 'Monk',         emoji: '🥋',  color: '#00FF98', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_monk.jpg' },
    druid:        { name: 'Druid',        emoji: '🌿',  color: '#FF7C0A', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_druid.jpg' },
    dh:           { name: 'Demon Hunter', emoji: '🟣',  color: '#A330C9', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_demonhunter.jpg' },
    demonhunter:  { name: 'Demon Hunter', emoji: '🟣',  color: '#A330C9', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_demonhunter.jpg' },
    evoker:       { name: 'Evoker',       emoji: '🐉',  color: '#33937F', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_evoker.jpg' },

    // --- Content types ---
    pve:          { name: 'PvE',          emoji: '⚔️',  color: '#B8860B', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_boss_archaedas.jpg' },
    pvp:          { name: 'PvP',          emoji: '🏆',  color: '#CC2222', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_arena_2v2_7.jpg' },
    misc:         { name: 'Miscellaneous',emoji: '🔧',  color: '#888888', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_enggizmos_27.jpg' },
    quest:        { name: 'Quest',        emoji: '📜',  color: '#D4AC0D', icon: 'https://wow.zamimg.com/images/wow/TextureAtlas/live/questnormal.png' },
    quests:       { name: 'Quest',        emoji: '📜',  color: '#D4AC0D', icon: 'https://wow.zamimg.com/images/wow/TextureAtlas/live/questnormal.png' },
    item:         { name: 'Item',         emoji: '💎',  color: '#A335EE', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_box_04.jpg' },
    items:        { name: 'Item',         emoji: '💎',  color: '#A335EE', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_box_04.jpg' },
    profession:   { name: 'Profession',   emoji: '🔨',  color: '#5B8DD9', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_engraving.jpg' },
    professions:  { name: 'Profession',   emoji: '🔨',  color: '#5B8DD9', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_engraving.jpg' },
    npc:          { name: 'NPC',          emoji: '🧑',  color: '#9E7E38', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_monsterhead_04.jpg' },
    achievement:  { name: 'Achievement',  emoji: '🏅',  color: '#FFD700', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_bg_winwsg.jpg' },
    delve:        { name: 'Delve',        emoji: '🪨',  color: '#8B5A2B', icon: 'https://wow.zamimg.com/images/wow/icons/large/ui_delves.jpg' },
    delves:       { name: 'Delve',        emoji: '🪨',  color: '#8B5A2B', icon: 'https://wow.zamimg.com/images/wow/icons/large/ui_delves.jpg' },

    // --- Professions ---
    cooking:        { name: 'Cooking',        emoji: '🍳', color: '#C8793C', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_food_15.jpg' },
    blacksmithing:  { name: 'Blacksmithing',  emoji: '⚒️', color: '#9E9E9E', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_blacksmithing.jpg' },
    enchanting:     { name: 'Enchanting',     emoji: '✨', color: '#AA44CC', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_engraving.jpg' },
    tailoring:      { name: 'Tailoring',      emoji: '🧵', color: '#CC88BB', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_tailoring.jpg' },
    engineering:    { name: 'Engineering',    emoji: '⚙️', color: '#AABB55', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_engineering.jpg' },
    herbalism:      { name: 'Herbalism',      emoji: '🌿', color: '#55BB55', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_herbalism.jpg' },
    mining:         { name: 'Mining',         emoji: '⛏️', color: '#888899', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_mining.jpg' },
    skinning:       { name: 'Skinning',       emoji: '🔪', color: '#CC9944', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_pelt_wolf_01.jpg' },
    alchemy:        { name: 'Alchemy',        emoji: '⚗️', color: '#44BBAA', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_alchemy.jpg' },
    jewelcrafting:  { name: 'Jewelcrafting',  emoji: '💍', color: '#DD77AA', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_gem_01.jpg' },
    inscription:    { name: 'Inscription',    emoji: '📝', color: '#9966AA', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_inscription_tradeskill01.jpg' },
    leatherworking: { name: 'Leatherworking', emoji: '🟤', color: '#AA7744', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_leatherworking.jpg' },

    // --- Features & Gameplay ---
    warband:           { name: 'Warband',          emoji: '⚜️',  color: '#888888', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_guildperk_everybodysfriend.jpg' },
    'knowledge points':{ name: 'Knowledge Points', emoji: '📚',  color: '#A335EE', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_book_11.jpg' },
    skyriding:         { name: 'Skyriding',         emoji: '🐦',  color: '#55AAFF', icon: 'https://wow.zamimg.com/images/wow/icons/large/ability_dragonriding_vigor01.jpg' },
    wq:                { name: 'World Quest',       emoji: '🗺️',  color: '#4CAF50', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_map_01.jpg' },
    dungeon:           { name: 'Dungeon',           emoji: '🏰',  color: '#546E7A', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_boss_archaedas.jpg' },
    raid:              { name: 'Raid',              emoji: '💥',  color: '#8D1A1A', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_heroic_gloryoftheraider.jpg' },

    // --- Events ---
    midsummer:        { name: 'Midsummer Fire Festival', emoji: '🔥', color: '#CC2222', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_summerfest_firespirit.jpg' },
    noblegarden:      { name: 'Noblegarden',             emoji: '🐣', color: '#FFF468', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_egg_02.jpg' },
    "children's week":{ name: "Children's Week",        emoji: '🎈', color: '#FFB6C1', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_toy_04.jpg' },

    // --- Dungeons (TWW) ---
    'ara-kara, city of echoes': { name: 'Ara-Kara, City of Echoes',   emoji: '🕷️', color: '#6B4423', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_arakara.jpg' },
    'ara-kara':                 { name: 'Ara-Kara, City of Echoes',   emoji: '🕷️', color: '#6B4423', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_arakara.jpg' },
    'city of threads':          { name: 'City of Threads',            emoji: '🕸️', color: '#2E3B4E', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_cityofthreads.jpg' },
    'the dawnbreaker':          { name: 'The Dawnbreaker',            emoji: '🌅', color: '#D4522A', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_dawnbreaker.jpg' },
    'dawnbreaker':              { name: 'The Dawnbreaker',            emoji: '🌅', color: '#D4522A', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_dawnbreaker.jpg' },
    'the stonevault':           { name: 'The Stonevault',             emoji: '🪨', color: '#78716C', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_stonevault.jpg' },
    'stonevault':               { name: 'The Stonevault',             emoji: '🪨', color: '#78716C', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_stonevault.jpg' },
    'priory of the sacred flame':{ name: 'Priory of the Sacred Flame',emoji: '🔥', color: '#C2410C', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_prioryofthesacredflame.jpg' },
    'priory':                   { name: 'Priory of the Sacred Flame', emoji: '🔥', color: '#C2410C', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_prioryofthesacredflame.jpg' },
    'the rookery':              { name: 'The Rookery',                emoji: '🦅', color: '#374151', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_therookery.jpg' },
    'rookery':                  { name: 'The Rookery',                emoji: '🦅', color: '#374151', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_therookery.jpg' },
    'darkflame cleft':          { name: 'Darkflame Cleft',            emoji: '🌋', color: '#1C0A00', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_darkflamecleft.jpg' },
    'cinderbrew meadery':       { name: 'Cinderbrew Meadery',         emoji: '🍺', color: '#92400E', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_cinderbrewmeadery.jpg' },
    'cinderbrew':               { name: 'Cinderbrew Meadery',         emoji: '🍺', color: '#92400E', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_cinderbrewmeadery.jpg' },

    // --- Dungeons (Legacy) ---
    'tazavesh':      { name: 'Tazavesh',                    emoji: '🏙️', color: '#4B5563', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_brokerdungeon.jpg' },
    'tazavesh:sow':  { name: 'Tazavesh: Streets of Wonder', emoji: '🏙️', color: '#4B5563', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_tazavesh_streets.jpg' },
    'tazavesh: sow': { name: 'Tazavesh: Streets of Wonder', emoji: '🏙️', color: '#4B5563', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_tazavesh_streets.jpg' },
    'tazavesh:sog':  { name: "Tazavesh: So'leah's Gambit", emoji: '🏙️', color: '#4B5563', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_tazavesh_gambit.jpg' },
    'tazavesh: sog': { name: "Tazavesh: So'leah's Gambit", emoji: '🏙️', color: '#4B5563', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_tazavesh_gambit.jpg' },
    'eda':           { name: 'Eco-Dome Aldani',             emoji: '🌿', color: '#2D6A4F', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_boss_archaedas.jpg' },

    general: { name: 'General', emoji: '📋', color: '#888888', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_note_01.jpg' }
};

/**
 * Parses the structured Firestorm bug-report description into an array of
 * { name, value } objects suitable for Discord embed fields.
 * Sections are delimited by known heading labels.
 * If the description has no recognised sections, returns null so the caller
 * can fall back to a plain description block.
 */
function parseDescriptionFields(text) {
    if (!text || text.trim().length === 0) return null;

    const SECTION_HEADINGS = [
        'Description of the bug',
        'Description',
        'How to reproduce',
        'How it should be',
        'Informations of the spell',
        'Links',
        'Talent',
        'Fixes',
        'Changes',
    ];

    // Build a regex that splits on any heading (case-insensitive, colon optional)
    const headingPattern = new RegExp(
        `(${SECTION_HEADINGS.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:?`,
        'gi'
    );

    const parts = text.split(headingPattern);
    if (parts.length <= 1) return null; // no sections found

    const fields = [];
    let i = 1; // parts[0] is text before first heading
    while (i < parts.length) {
        const heading = parts[i].trim();
        const body = (parts[i + 1] || '').trim();
        i += 2;
        if (body.length === 0) continue;
        fields.push({
            name: heading,
            // Discord field values max 1024 chars
            value: body.length > 1024 ? body.substring(0, 1021) + '...' : body,
            inline: false,
        });
    }
    return fields.length > 0 ? fields : null;
}

/**
 * Extracts the "subject" from a Firestorm changelog title — i.e. the human
 * readable text after all the [bracket] tags, which names the spell, NPC,
 * zone, or item being changed.
 *
 * Examples:
 *   "[Delve][Archival Assault][NPC] Shadowguard Arcanist" → "Shadowguard Arcanist"
 *   "[Warrior][Arms] Mortal Strike"                       → "Mortal Strike"
 *   "Waygate Wiles"                                        → "Waygate Wiles"
 */
function extractTitleSubject(title) {
    if (!title) return '';
    // Strip all leading [tag] groups and any surrounding whitespace
    return title.replace(/^(\[[^\]]*\]\s*)+/, '').trim();
}

/**
 * Builds a Wowhead search URL for the extracted subject term.
 * Discord embed titles do NOT support [text](url) markdown — only
 * description/field text does. We therefore set the embed's .setURL()
 * to a Wowhead search so that clicking the title itself opens Wowhead
 * for the specific spell, NPC, zone, or item named in the entry.
 */
function wowheadSearchUrl(subject) {
    if (!subject) return null;
    const query = encodeURIComponent(subject.trim());
    return `https://www.wowhead.com/search?q=${query}`;
}

function htmlToMarkdown(htmlStr) {
    if (!htmlStr) return '';
    return htmlStr
        .replace(/<hr\s*\/?>/ig, '')
        .replace(/<br\s*\/?>/ig, '\n')
        .replace(/<b>(.*?)<\/b>/ig, '**$1**')
        .replace(/<strong>(.*?)<\/strong>/ig, '**$1**')
        .replace(/<i>(.*?)<\/i>/ig, '*$1*')
        .replace(/<em>(.*?)<\/em>/ig, '*$1*')
        .replace(/<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1[^>]*>(.*?)<\/a>/ig, '[$3]($2)')
        .replace(/<\/?[^>]+(>|$)/g, '') // strip remaining tags
        .replace(/&amp;/g, '&') // DO THIS FIRST
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Bold known headings
        .replace(/(Description of the bug|How to reproduce|How it should be|Informations of the spell|Links|Talent:|Description:|Fixes:|Changes:)/gi, '**$1**')
        // Clean up excessive newlines
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Fetches the changelog, parses it, and posts new entries to Discord.
 */
async function fetchAndPostChangelogs(client) {
    try {
        // Abort the request after 10 seconds to prevent the cron from hanging
        // indefinitely if the Firestorm site is slow or down.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);

        let response;
        try {
            response = await fetch(CHANGELOG_URL, { signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            console.error(`[Changelog] Failed to fetch changelog: ${response.statusText}`);
            return;
        }

        const html = await response.text();

        // [OPTIMIZATION]: The Firestorm changelog page can be ~11MB of HTML.
        // We only care about the latest few days. We use a fast regex to 
        // slice the HTML string at the 4th date header, dropping the size.
        let limitIndex = -1;
        let matchCount = 0;
        const regex = /<h3\s+data-date=/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            matchCount++;
            if (matchCount === 4) { // Only parse the 3 most recent days
                limitIndex = match.index;
                break;
            }
        }
        const slicedHtml = limitIndex !== -1 ? html.substring(0, limitIndex) : html;

        const $ = cheerio.load(slicedHtml);
        const newChangelogs = [];

        const container = $('.changelog_container').first();
        // Fallback to today at midnight UTC so hashes are stable across runs
        // (avoids "new Date()" which has millisecond variance between cron ticks).
        const todayUtcMidnight = new Date();
        todayUtcMidnight.setUTCHours(0, 0, 0, 0);
        let currentDate = todayUtcMidnight;

        container.children().each((i, el) => {
            const tag = el.tagName.toLowerCase();
            if (tag === 'h3') {
                const dateVal = $(el).attr('data-date');
                if (dateVal) {
                    // dateVal is a unix timestamp in seconds.
                    // Normalize to midnight UTC so the hash is stable across runs.
                    const parsedDate = new Date(parseInt(dateVal) * 1000);
                    parsedDate.setUTCHours(0, 0, 0, 0);
                    currentDate = parsedDate;
                }
            } else if (tag === 'div' && $(el).hasClass('cards')) {
                $(el).find('.card').each((j, cardEl) => {
                    const card = $(cardEl);
                    const title = card.attr('data-title');
                    const descriptionHtml = card.find('.description').html() || '';
                    const imgSrc = card.find('.title img').attr('src') || null;

                    const description = htmlToMarkdown(descriptionHtml);

                    // Only require a title — descriptions can legitimately be empty
                    // (e.g. stub NPC entries). We still need to track them so they
                    // don't get re-evaluated as "unseen" on every cron tick.
                    if (title) {
                        // Determine category/class from the card's classes
                        const classes = (card.attr('class') || '').split(' ');
                        let category = 'General Update';
                        let color = '#ffaa00';
                        let icon = null;

                        // Check for tags in title like [Quest], [Item], etc.
                        const titleTagsMatch = title.match(/\[(.*?)\]/g);
                        const tags = titleTagsMatch ? titleTagsMatch.map(t => t.replace(/[\[\]]/g, '').toLowerCase()) : [];

                        // Title tags are checked FIRST (more specific), then card CSS classes.
                        // This ensures [Delve] in the title beats a generic 'delve' HTML class.
                        const possibleCategories = [...tags, ...classes.map(c => c.toLowerCase())];

                        let emoji = '📋';
                        for (const cls of possibleCategories) {
                            if (categoryInfo[cls]) {
                                category = categoryInfo[cls].name;
                                color = categoryInfo[cls].color;
                                icon = categoryInfo[cls].icon;
                                emoji = categoryInfo[cls].emoji || '📋';
                                break;
                            }
                        }

                        // Use Firestorm's image if no custom icon found, and resolve relative URLs
                        let finalImgSrc = icon || imgSrc;
                        if (finalImgSrc && finalImgSrc.startsWith('/')) {
                            finalImgSrc = 'https://firestorm-servers.com' + finalImgSrc;
                        }

                        // Extract the human-readable subject (text after all [tags]) for Wowhead
                        const subject = extractTitleSubject(title);

                        const hash = createChangelogHash(title, currentDate);
                        newChangelogs.push({ title, description, category, emoji, color, imgSrc: finalImgSrc, subject, date: currentDate, hash });
                    }
                });
            }
        });

        // We want to process oldest first to post in chronological order, 
        // but the website lists newest first. So let's reverse the array.
        newChangelogs.reverse();

        // Get or create our global bot state to track posted changelogs
        let botState = await BotState.findOne({ guildId: 'global' });
        if (!botState) {
            botState = new BotState({ guildId: 'global', postedChangelogs: [] });
        }

        const postedHashes = new Set(botState.postedChangelogs || []);
        const toPost = [];
        
        // If this is the VERY FIRST time we are running and we have no history,
        // we might not want to spam 50 historical changelogs.
        // We will just mark all current ones as seen, but we DO want to post 
        // the last 3 items so the user can verify it's working!
        const isFirstRun = postedHashes.size === 0;
        const totalItems = newChangelogs.length;

        for (let i = 0; i < totalItems; i++) {
            const item = newChangelogs[i];
            if (!postedHashes.has(item.hash)) {
                if (!isFirstRun || i >= totalItems - 3) {
                    toPost.push(item);
                } else {
                    // It's the first run and this is an old item, just mark it as posted
                    botState.postedChangelogs.push(item.hash);
                }
            }
        }

        // Save immediately to mark the historical ones as seen during the first run
        if (isFirstRun) {
            await botState.save();
        }

        if (toPost.length > 0) {
            const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
            if (channel) {
                let successCount = 0;

                // Post each changelog entry as its own message so Discord renders
                // it cleanly (one embed = one thumbnail, no repeated banner grid).
                for (const item of toPost) {
                    // --- Embed title URL --------------------------------------------------
                    // Discord embed titles do NOT support [text](url) markdown.
                    // Instead we set .setURL() to a Wowhead search for the specific
                    // subject extracted from the title (spell / NPC / zone / item),
                    // making clicking the title open the relevant Wowhead results.
                    // The Firestorm changelog link is kept on the author and the button.
                    const titleUrl = item.subject
                        ? (wowheadSearchUrl(item.subject) ?? CHANGELOG_URL)
                        : CHANGELOG_URL;

                    const embed = new EmbedBuilder()
                        .setAuthor({
                            name: 'Firestorm Changelog · The War Within',
                            iconURL: 'https://firestorm-servers.com/assets/img/expansion/exp_glow_tww.png',
                            url: CHANGELOG_URL,
                        })
                        .setTitle(item.title)
                        .setColor(item.color || '#ffaa00')
                        .setURL(titleUrl)
                        .setFooter({ text: `${item.emoji ?? '📋'}  ${item.category}` })
                        .setTimestamp(item.date);

                    if (item.imgSrc) {
                        embed.setThumbnail(item.imgSrc);
                    }

                    // Prefer structured fields if the description uses known section headings;
                    // otherwise fall back to a single plain description block.
                    if (item.description && item.description.trim().length > 0) {
                        const fields = parseDescriptionFields(item.description);
                        if (fields) {
                            // Cap at 25 fields (Discord limit)
                            embed.addFields(fields.slice(0, 25));
                        } else {
                            embed.setDescription(
                                item.description.length > 4096
                                    ? item.description.substring(0, 4093) + '...'
                                    : item.description
                            );
                        }
                    }

                    // Action row: button linking back to the full Firestorm changelog
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel('View on Firestorm')
                            .setStyle(ButtonStyle.Link)
                            .setURL(CHANGELOG_URL)
                            .setEmoji('🔥')
                    );

                    try {
                        await channel.send({ embeds: [embed], components: [row] });

                        // Mark as posted and save immediately after each successful send
                        botState.postedChangelogs.push(item.hash);
                        successCount++;

                        // Keep the last 500 hashes to cover high-volume days without
                        // accidentally evicting recent entries and causing reposts.
                        if (botState.postedChangelogs.length > 500) {
                            botState.postedChangelogs = botState.postedChangelogs.slice(-500);
                        }

                        botState.markModified('postedChangelogs');
                        await botState.save();

                        // 1.5 s gap between messages to stay under Discord rate limits
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    } catch (err) {
                        console.error(`[Changelog] Failed to post item "${item.title}":`, err);
                    }
                }
                console.log(`[Changelog] Successfully posted ${successCount} new updates.`);
            } else {
                console.error(`[Changelog] Could not find channel with ID ${CHANNEL_ID}`);
            }
        }

    } catch (error) {
        console.error('[Changelog] Error fetching or posting changelogs:', error);
    }
}

/**
 * Initializes the background cron job to check for changelogs.
 */
function startChangelogCron(client) {
    // Run every 2 minutes for live checking.
    // The callback is async and explicitly catches errors so the promise is never
    // left floating (which would trigger the global unhandledRejection handler).
    cron.schedule('*/2 * * * *', async () => {
        await fetchAndPostChangelogs(client).catch(err =>
            console.error('[Changelog] Unhandled error in cron tick:', err)
        );
    });

    // Also run it once immediately on startup (after a slight delay to ensure bot is ready)
    setTimeout(() => {
        fetchAndPostChangelogs(client).catch(err =>
            console.error('[Changelog] Unhandled error on startup run:', err)
        );
    }, 5000);
}

module.exports = {
    startChangelogCron,
    fetchAndPostChangelogs
};
