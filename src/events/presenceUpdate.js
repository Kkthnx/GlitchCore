const { Events, ActivityType, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');

// Cache to store active streams to prevent spam and handle cleanup
// Key: userId, Value: { messageId, timeoutId }
const activeStreams = new Map();

// Configuration
const CONFIG = {
    STREAMER_ID: '884477672741290066', // Replace with your Discord User ID
    YOUTUBE_URL: 'https://www.youtube.com/@KkthnxTV',
    CLEANUP_DELAY_MS: 5 * 60 * 1000, // 5 minutes buffer for OBS disconnects
    COLORS: {
        LIVE: '#00FFFF',   // Cyan
        OFFLINE: '#808080' // Gray
    }
};

module.exports = {
    name: 'presenceUpdate',
    async execute(oldPresence, newPresence, client) {
        // 1. Ensure this is only firing for you (Kkthnx)
        if (newPresence.userId !== CONFIG.STREAMER_ID) return;

        const guild = newPresence.guild;
        // Use the chatroom ID from config
        const announceChannel = guild.channels.cache.get(config.channels.chatroom);
        if (!announceChannel) return;

        // 2. Look for a streaming activity
        const activities = newPresence.activities || [];
        const streamActivity = activities.find(a => a.type === ActivityType.Streaming);

        const isStreamingYouTube = streamActivity && streamActivity.url?.includes('youtu');
        const streamData = activeStreams.get(newPresence.userId);

        // --- SCENARIO A: YOU JUST WENT LIVE ---
        if (isStreamingYouTube) {
            // If there's a pending cleanup timeout, cancel it (OBS flickered!)
            if (streamData?.timeoutId) {
                clearTimeout(streamData.timeoutId);
                activeStreams.set(newPresence.userId, { messageId: streamData.messageId, timeoutId: null });
                return;
            }

            // If we are already tracking this stream, do nothing
            if (streamData?.messageId) return;

            // Build the "Now Live" Embed
            const liveEmbed = new EmbedBuilder()
                .setColor(CONFIG.COLORS.LIVE)
                .setAuthor({ name: 'KkthnxTV is now LIVE!', iconURL: newPresence.user.displayAvatarURL() })
                .setTitle(streamActivity.details || 'Live on YouTube!')
                .setURL(streamActivity.url)
                .addFields(
                    { name: 'Playing', value: streamActivity.state || 'Variety', inline: true }
                )
                .setImage('https://raw.githubusercontent.com/Kkthnx/KkthnxUI/master/KkthnxUI_Banner.png') // Optional: Drop a custom banner here
                .setTimestamp();

            // Send and cache the message ID
            try {
                const msg = await announceChannel.send({
                    content: `Hey @everyone, Kkthnx is live!`,
                    embeds: [liveEmbed]
                });
                activeStreams.set(newPresence.userId, { messageId: msg.id, timeoutId: null });
            } catch (error) {
                console.error("Failed to send live announcement:", error);
            }
        }

        // --- SCENARIO B: YOU WENT OFFLINE ---
        else if (!isStreamingYouTube && streamData && !streamData.timeoutId) {

            // Set a delay before cleanup to ensure it wasn't just a 10-second OBS drop
            const timeout = setTimeout(async () => {
                try {
                    const msgToEdit = await announceChannel.messages.fetch(streamData.messageId);
                    if (msgToEdit) {
                        // Create an "Offline" version of the embed
                        const offlineEmbed = EmbedBuilder.from(msgToEdit.embeds[0])
                            .setColor(CONFIG.COLORS.OFFLINE)
                            .setAuthor({ name: 'KkthnxTV Stream Ended', iconURL: newPresence.user.displayAvatarURL() })
                            .setTitle('Thanks for watching!')
                            .setURL(CONFIG.YOUTUBE_URL); // Redirect to channel instead of dead stream link

                        // Edit message: Remove the @everyone ping from content, update embed
                        await msgToEdit.edit({ content: 'Stream has concluded.', embeds: [offlineEmbed] });
                    }
                } catch (error) {
                    console.error("Failed to cleanup stream announcement:", error);
                } finally {
                    // Fully remove from cache
                    activeStreams.delete(newPresence.userId);
                }
            }, CONFIG.CLEANUP_DELAY_MS);

            // Save the timeout ID to the cache so we can cancel it if you reconnect
            activeStreams.set(newPresence.userId, { messageId: streamData.messageId, timeoutId: timeout });
        }
    }
};
