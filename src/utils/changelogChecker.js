const cron = require('node-cron');
const cheerio = require('cheerio');
const { EmbedBuilder } = require('discord.js');
const crypto = require('crypto');
const BotState = require('../database/BotStateSchema');

// The specific channel ID provided by the user
const CHANNEL_ID = '1354283517105930241';
const CHANGELOG_URL = 'https://firestorm-servers.com/en/changelog/tww';

/**
 * Creates a unique hash for a changelog item based on title and description.
 */
function createChangelogHash(title, description) {
    return crypto.createHash('sha256').update(`${title}||${description}`).digest('hex');
}

const categoryInfo = {
    warrior: { name: 'Warrior', color: '#C69B6D', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_warrior.jpg' },
    paladin: { name: 'Paladin', color: '#F48CBA', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_paladin.jpg' },
    hunter: { name: 'Hunter', color: '#ABD473', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_hunter.jpg' },
    rogue: { name: 'Rogue', color: '#FFF468', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_rogue.jpg' },
    priest: { name: 'Priest', color: '#FFFFFF', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_priest.jpg' },
    dk: { name: 'Death Knight', color: '#C41E3A', icon: 'https://wow.zamimg.com/images/wow/icons/large/spell_deathknight_classicon.jpg' },
    deathknight: { name: 'Death Knight', color: '#C41E3A', icon: 'https://wow.zamimg.com/images/wow/icons/large/spell_deathknight_classicon.jpg' },
    shaman: { name: 'Shaman', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_shaman.jpg' },
    mage: { name: 'Mage', color: '#3FC7EB', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_mage.jpg' },
    warlock: { name: 'Warlock', color: '#8788EE', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_warlock.jpg' },
    monk: { name: 'Monk', color: '#00FF98', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_monk.jpg' },
    druid: { name: 'Druid', color: '#FF7C0A', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_druid.jpg' },
    dh: { name: 'Demon Hunter', color: '#A330C9', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_demonhunter.jpg' },
    demonhunter: { name: 'Demon Hunter', color: '#A330C9', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_demonhunter.jpg' },
    evoker: { name: 'Evoker', color: '#33937F', icon: 'https://wow.zamimg.com/images/wow/icons/large/classicon_evoker.jpg' },
    pve: { name: 'PvE', color: '#EEDB99', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_boss_archaedas.jpg' },
    pvp: { name: 'PvP', color: '#CC2222', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_arena_2v2_7.jpg' },
    misc: { name: 'Miscellaneous', color: '#888888', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_enggizmos_27.jpg' },
    quest: { name: 'Quest', color: '#EEDB99', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg' },
    quests: { name: 'Quest', color: '#EEDB99', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg' },
    item: { name: 'Item', color: '#A335EE', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_box_04.jpg' },
    items: { name: 'Item', color: '#A335EE', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_box_04.jpg' },
    profession: { name: 'Profession', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_engraving.jpg' },
    professions: { name: 'Profession', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_engraving.jpg' },
    npc: { name: 'NPC', color: '#EEDB99', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_monsterhead_04.jpg' },
    achievement: { name: 'Achievement', color: '#EEDB99', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_bg_winwsg.jpg' },
    delve: { name: 'Delve', color: '#EEDB99', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_relics_hourglass.jpg' },
    delves: { name: 'Delve', color: '#EEDB99', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_relics_hourglass.jpg' },

    // Professions
    cooking: { name: 'Cooking', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_food_15.jpg' },
    blacksmithing: { name: 'Blacksmithing', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_blacksmithing.jpg' },
    enchanting: { name: 'Enchanting', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_engraving.jpg' },
    tailoring: { name: 'Tailoring', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_tailoring.jpg' },
    engineering: { name: 'Engineering', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_engineering.jpg' },
    herbalism: { name: 'Herbalism', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_herbalism.jpg' },
    mining: { name: 'Mining', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_mining.jpg' },
    skinning: { name: 'Skinning', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_pelt_wolf_01.jpg' },
    alchemy: { name: 'Alchemy', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_alchemy.jpg' },
    jewelcrafting: { name: 'Jewelcrafting', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_gem_01.jpg' },
    inscription: { name: 'Inscription', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_inscription_tradeskill01.jpg' },
    leatherworking: { name: 'Leatherworking', color: '#0070DD', icon: 'https://wow.zamimg.com/images/wow/icons/large/trade_leatherworking.jpg' },

    // Features & Gameplay
    warband: { name: 'Warband', color: '#888888', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_guildperk_everybodysfriend.jpg' },
    'knowledge points': { name: 'Knowledge Points', color: '#A335EE', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_book_11.jpg' },
    skyriding: { name: 'Skyriding', color: '#EEDB99', icon: 'https://wow.zamimg.com/images/wow/icons/large/ability_dragonriding_vigor01.jpg' },
    wq: { name: 'World Quest', color: '#EEDB99', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_map_01.jpg' },
    dungeon: { name: 'Dungeon', color: '#EEDB99', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_boss_archaedas.jpg' },
    raid: { name: 'Raid', color: '#EEDB99', icon: 'https://wow.zamimg.com/images/wow/icons/large/achievement_dungeon_heroic_gloryoftheraider.jpg' },

    // Events
    midsummer: { name: 'Midsummer Fire Festival', color: '#CC2222', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_summerfest_firespirit.jpg' },
    noblegarden: { name: 'Noblegarden', color: '#FFF468', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_egg_02.jpg' },
    "children's week": { name: "Children's Week", color: '#EEDB99', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_toy_04.jpg' },

    general: { name: 'General', color: '#888888', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_note_01.jpg' }
};

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
        let currentDate = new Date(); // fallback

        container.children().each((i, el) => {
            const tag = el.tagName.toLowerCase();
            if (tag === 'h3') {
                const dateVal = $(el).attr('data-date');
                if (dateVal) {
                    // dateVal is a unix timestamp in seconds
                    currentDate = new Date(parseInt(dateVal) * 1000);
                }
            } else if (tag === 'div' && $(el).hasClass('cards')) {
                $(el).find('.card').each((j, cardEl) => {
                    const card = $(cardEl);
                    const title = card.attr('data-title');
                    const descriptionHtml = card.find('.description').html() || '';
                    const imgSrc = card.find('.title img').attr('src') || null;

                    const description = htmlToMarkdown(descriptionHtml);

                    if (title && description) {
                        // Determine category/class from the card's classes
                        const classes = (card.attr('class') || '').split(' ');
                        let category = 'General Update';
                        let color = '#ffaa00';
                        let icon = null;

                        // Check for tags in title like [Quest], [Item], etc.
                        const titleTagsMatch = title.match(/\[(.*?)\]/g);
                        const tags = titleTagsMatch ? titleTagsMatch.map(t => t.replace(/[\[\]]/g, '').toLowerCase()) : [];

                        // Combine tags and classes to find a category match
                        const possibleCategories = [...classes.map(c => c.toLowerCase()), ...tags];

                        for (const cls of possibleCategories) {
                            if (categoryInfo[cls]) {
                                category = categoryInfo[cls].name;
                                color = categoryInfo[cls].color;
                                icon = categoryInfo[cls].icon;
                                break;
                            }
                        }

                        // Use Firestorm's image if no custom icon found, and resolve relative URLs
                        let finalImgSrc = icon || imgSrc;
                        if (finalImgSrc && finalImgSrc.startsWith('/')) {
                            finalImgSrc = 'https://firestorm-servers.com' + finalImgSrc;
                        }

                        const hash = createChangelogHash(title, description);
                        newChangelogs.push({ title, description, category, color, imgSrc: finalImgSrc, date: currentDate, hash });
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
                for (const item of toPost) {
                    const embed = new EmbedBuilder()
                        .setAuthor({ name: 'Firestorm Changelog - The War Within', iconURL: 'https://firestorm-servers.com/assets/img/expansion/exp_glow_tww.png', url: CHANGELOG_URL })
                        .setTitle(item.title)
                        .setColor(item.color || '#ffaa00')
                        .setURL(CHANGELOG_URL)
                        .setImage('https://firestorm-servers.com/assets/img/realm/tww.png')
                        .setFooter({ text: `Category: ${item.category}` })
                        .setTimestamp(item.date);
                    
                    if (item.imgSrc) {
                        embed.setThumbnail(item.imgSrc);
                    }

                    try {
                        await channel.send({ embeds: [embed] });
                        
                        // Mark as posted and save only on success
                        botState.postedChangelogs.push(item.hash);
                        if (botState.postedChangelogs.length > 100) {
                            botState.postedChangelogs = botState.postedChangelogs.slice(-100);
                        }
                        await botState.save();
                        successCount++;

                        // Sleep 1 second between posts to avoid Discord rate limits
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (err) {
                        console.error(`[Changelog] Failed to post update "${item.title}":`, err);
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
    // Run every 15 minutes.
    // The callback is async and explicitly catches errors so the promise is never
    // left floating (which would trigger the global unhandledRejection handler).
    cron.schedule('*/15 * * * *', async () => {
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
