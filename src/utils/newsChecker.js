const { EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const crypto = require('crypto');
const cheerio = require('cheerio');
const BotState = require('../database/BotStateSchema');

const NEWS_URL = 'https://firestorm-servers.com/en/news/index';
const CHANNEL_ID = '1354283517105930241';

/**
 * Fetches the news, parses it, and posts new entries to Discord.
 */
async function fetchAndPostNews(client) {
    try {
        const response = await fetch(NEWS_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch news: HTTP ${response.status}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        const newArticles = [];
        
        $('.news_unit').each((i, el) => {
            const item = $(el);
            const container = item.find('.news');
            
            // Extract the data fields based on Firestorm DOM
            let imgSrc = container.find('img').attr('src');
            // Resolve relative img paths to absolute
            if (imgSrc && imgSrc.startsWith('/')) {
                imgSrc = `https://firestorm-servers.com${imgSrc}`;
            }

            const expansion = container.find('.news_expansion').text().trim();
            const title = container.find('.news_title').text().trim();
            const date = container.find('.news_date').text().trim();
            
            // Extract the direct link to the post from the ajax attribute
            const ajaxAttr = item.attr('ajax');
            const postUrl = ajaxAttr ? `https://firestorm-servers.com/en/news/${ajaxAttr}` : NEWS_URL;

            // Gather only the first valid paragraph for a short excerpt
            let description = '';
            container.find('.news_description p').each((_, p) => {
                const text = $(p).text().trim();
                if (text && text.length > 0 && text !== '&nbsp;' && description === '') {
                    description = text;
                }
            });
            
            if (!title) return; // Skip invalid items
            
            // Build a unique hash based on title and date
            const hashString = `${title}||${date}`;
            const hash = crypto.createHash('sha256').update(hashString).digest('hex');

            // Format description for Discord Embeds with a short preview
            if (description.length > 300) {
                description = description.substring(0, 300) + '...';
            }
            description += `\n\n**[Read more on the official website](${postUrl})**`;
            
            newArticles.push({
                hash,
                title,
                expansion,
                date,
                description,
                imgSrc,
                postUrl,
            });
        });

        // The site lists newest items first, so reverse to post oldest-new first
        newArticles.reverse();

        // Check against the database to see which ones are truly new
        let botState = await BotState.findOne({ guildId: 'global' });
        if (!botState) {
            botState = new BotState({ guildId: 'global' });
        }

        const postedHashes = new Set(botState.postedNews || []);
        const toPost = [];
        
        // If this is the VERY FIRST time we are running and we have no history,
        // we might not want to spam 50 historical news articles.
        // We will just mark all current ones as seen, but we DO want to post 
        // the last 1 item so the user can verify it's working!
        const isFirstRun = postedHashes.size === 0;
        const totalItems = newArticles.length;

        for (let i = 0; i < totalItems; i++) {
            const item = newArticles[i];
            if (!postedHashes.has(item.hash)) {
                if (!isFirstRun || i >= totalItems - 1) {
                    toPost.push(item);
                } else {
                    // It's the first run and this is an old item, just mark it as posted
                    botState.postedNews.push(item.hash);
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
                        .setAuthor({ name: `Firestorm News - ${item.expansion}`, iconURL: 'https://firestorm-servers.com/assets/img/expansion/exp_glow_tww.png', url: item.postUrl })
                        .setTitle(item.title)
                        .setDescription(item.description)
                        .setColor('#ffaa00')
                        .setURL(item.postUrl)
                        .setFooter({ text: `Date: ${item.date}` })
                        .setTimestamp();
                    
                    if (item.imgSrc) {
                        embed.setImage(item.imgSrc);
                    }

                    try {
                        await channel.send({ embeds: [embed] });
                        
                        // Mark as posted and save only on success
                        botState.postedNews.push(item.hash);
                        if (botState.postedNews.length > 100) {
                            botState.postedNews = botState.postedNews.slice(-100);
                        }
                        await botState.save();
                        successCount++;

                        // Sleep 1 second between posts to avoid Discord rate limits
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (err) {
                        console.error(`[News] Failed to post update "${item.title}":`, err);
                    }
                }
                console.log(`[News] Successfully posted ${successCount} new updates.`);
            } else {
                console.error(`[News] Could not find channel with ID ${CHANNEL_ID}`);
            }
        }

    } catch (error) {
        console.error('[News] Error fetching or posting news:', error);
    }
}

/**
 * Initializes the background cron job to check for news.
 */
function startNewsCron(client) {
    // Run every 30 minutes.
    cron.schedule('*/30 * * * *', async () => {
        await fetchAndPostNews(client).catch(err =>
            console.error('[News] Unhandled error in cron tick:', err)
        );
    });
    
    // Also run immediately on startup
    fetchAndPostNews(client);
}

module.exports = {
    startNewsCron,
    fetchAndPostNews
};
