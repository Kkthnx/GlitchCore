# GlitchCore

GlitchCore is the custom Discord bot for the Glitch Haven gaming community, built with [Discord.js](https://discord.js.org/) v14 and Node.js. It runs under a sharding manager, stores data in MongoDB via Mongoose, and auto-deploys its slash commands on startup.

## Features

### Leveling and engagement
- **XP and leveling** — earn XP from text messages and voice chat, with Double XP days (max level 1000). XP is buffered in memory and bulk-written to keep the database light.
- **Rank cards** — `/rank` renders a custom card with selectable styles via `/rankstyle`, and `/leaderboard` shows the top players.
- **Milestone level-roles** — `/levelrewards milestones interval:10` auto-creates and grants a prestige role every N levels (rank or stacking mode).
- **Opt-in Double XP role** — announcements ping a self-assigned `@DoubleXP` role instead of `@everyone` when one is set.
- **Daily streaks and stats** — `/daily` streak rewards and `/stats` server insights.

### Community
- **Self-assign roles** — `/roles` menu plus postable panels for games and pings.
- **Reaction roles** — `/reactionrole` builds menus where members react to grant or remove a role (menu IDs cached in memory so reactions stay cheap).
- **Game-night events** — `/event create` schedules a session with RSVP buttons and an auto-promoting waitlist, or a sign-up-free **recurring weekly reminder** (`repeat_weekly`) with bundled banners that reposts itself and cleans up the old card.
- **Birthdays** — `/birthday set` saves a month/day and a local-midnight scheduler shouts out the day's birthdays (deduped so restarts don't double-post).
- **LFG** — `/lfg` looking-for-group lobbies with live roster buttons and stale-session cleanup.
- **Starboard** — star-react highly-rated messages into a highlights channel; the count tracks up and down.
- **Suggestions** — `/suggest` posts a votable suggestion with manager approve/deny.
- **Polls** — `/poll` native Discord polls with up to 6 options.
- **Giveaways** — `/giveaway` with atomic entry and automatic winner draws.
- **Streamer go-live** — `/streamers` announces when tracked members go live on Twitch and removes the post when they go offline.
- **Tags** — `/tag` saved canned responses for FAQs and info (managed with Manage Messages).
- **Reminders and AFK** — `/remind` and `/afk`.
- **Welcome and farewell** — glitch-styled join banners and sly leave messages.

### Moderation and safety
- **Moderation suite** — `/warn`, `/timeout`, `/kick`, `/ban` (with optional temp-ban `duration` that auto-unbans), and `/infractions`, backed by a persistent infraction log and a mod-log channel.
- **Audit logging** — message edits and deletes are logged to the mod-log channel.
- **Anti-raid / anti-spam** — auto-detects invite links, mass mentions, and message flooding, with per-guild toggles.
- **Content auto-moderation** — configurable filter with themed clapbacks.
- **Privacy** — `/forgetme export` downloads a user's stored data and `/forgetme delete` erases their profile on confirmation; all per-guild data is purged when the bot leaves a server.

### Under the hood
- Sharding via `ShardingManager`, with buffered XP flushed on shutdown.
- Shard-scoped schedulers so multi-shard setups never double-fire.
- Timezone-aware scheduling (Double XP, birthdays, recurring events) so a UTC host never posts on the wrong day.
- `@napi-rs/canvas` for rank cards, welcome banners, and event art.
- Winston structured logging with automatic secret redaction.

See [PRIVACY.md](./PRIVACY.md) for the data-handling policy.

## Testing and linting

```bash
npm test        # run the Jest unit suite
npm run lint    # eslint
npm run lint:fix
```

## Prerequisites

- Node.js v20 or newer
- A MongoDB instance (Mongoose)
- A Discord bot token with the Server Members and Message Content privileged intents enabled

## Installation

1. Clone the repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure your environment. Copy `.env.example` to `.env` and fill in the values:

   ```bash
   cp .env.example .env
   ```

   Core values:

   ```env
   TOKEN=your_bot_token_here
   CLIENT_ID=your_application_client_id
   GUILD_ID=your_dev_guild_id
   MONGO_URI=your_mongodb_uri_here

   # Optional services
   STEAMGRIDDB_API_KEY=your_steamgriddb_key
   TWITCH_CLIENT_ID=your_twitch_client_id
   TWITCH_CLIENT_SECRET=your_twitch_client_secret

   # Logging
   NODE_ENV=development
   LOG_LEVEL=info

   # Register slash commands on startup (default on). "false" = deploy manually.
   AUTO_DEPLOY=true
   ```

   **Channel IDs live in the environment, not in the repo.** Set the channels you use:

   ```env
   WELCOME_CHANNEL_ID=
   LEAVE_CHANNEL_ID=
   ANNOUNCEMENTS_CHANNEL_ID=
   LFG_CHANNEL_ID=
   LEVEL_UP_LOG_CHANNEL_ID=
   MOD_LOG_CHANNEL_ID=
   BIRTHDAY_CHANNEL_ID=
   ERROR_CHANNEL_ID=
   ```

   `LEAVE_CHANNEL_ID` and `BIRTHDAY_CHANNEL_ID` fall back to the welcome and announcements channels when blank.

4. Set `timezone` in `config.json` (an IANA name like `America/New_York`) to your community's timezone. Double XP days, birthday shoutouts, and recurring events are all evaluated in this timezone, so the host can run in UTC without posting early or re-posting on restart. Per-guild settings (mod-log, starboard, streamer, and suggestion channels) are managed at runtime with `/settings`.

## Usage

```bash
npm start     # launch via the shard manager (auto-deploys commands)
npm run dev   # development with nodemon
npm run deploy  # manually (re)register slash commands
```

Windows users can also run `start_bot.bat`.

## License and Copyright

**Copyright © 2026 Kkthnx. All Rights Reserved.**

This project is **proprietary and closed-source**. No permission is granted to
use, copy, modify, distribute, host, or create derivative works from any part
of this code without the express written permission of the author. Viewing this
repository does not grant any license. See [LICENSE](./LICENSE) for full terms.
