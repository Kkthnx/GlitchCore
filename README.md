# GlitchCore

The Discord bot behind the Glitch Haven gaming community. It levels people up for chatting and hanging out in voice, runs game nights and LFG posts, keeps the server moderated, and looks after the small chores (roles, birthdays, giveaways, stream alerts) so staff don't have to.

Built on Discord.js v14 and Node.js, stored in MongoDB, and run under a sharding manager. The server is 18+, so the bot ships with an age gate and a moderation stack tuned for a busy adult community.

## What it does

**Levels and activity**
- XP from text and voice, with per-server tuning. Voice only pays when you are unmuted and not alone.
- Rank cards drawn in code (`/rank`, 10 styles via `/rankstyle`), `/leaderboard`, `/profile`, and a `/daily` streak.
- Milestone level roles that create themselves (`/levelrewards`), plus Double XP every Friday and Saturday with an opt-in ping role.

**Community**
- Game nights with RSVP, waitlist and start-time pings (`/event`), and LFG posts with a roster and waitlist (`/lfg`).
- Join-to-create voice lobbies. Join the hub channel and the bot builds you a lobby, then cleans it up when it empties (`/voice`).
- 18+ verification gate, self-assign roles, reaction roles, polls, giveaways, suggestions, tags, reminders, AFK, birthdays.
- Twitch go-live announcements that delete themselves when the stream ends (`/streamers`), and a starboard.

**Moderation**
- `/warn`, `/timeout`, `/kick`, `/ban` (permanent or timed), `/massban`, `/unban`, `/purge`, `/lock`, `/slowmode`, and a per-member infraction history.
- Auto-mod for slurs, invites, known phishing domains, mention spam, floods and repeated messages.
- Raid mode that trips on a join flood and holds new members until staff clear the raiders.
- Audit log in the mod-log channel, strike escalation, and an appeal flow. Full detail is in [docs/MODERATION.md](docs/MODERATION.md).

**Privacy**
- `/forgetme` exports or deletes everything stored about a member, and all server data is purged when the bot is removed. See [PRIVACY.md](PRIVACY.md).

## Commands

| Area | Commands |
| --- | --- |
| Levels | `/rank` `/rankstyle` `/leaderboard` `/profile` `/daily` `/levelrewards` |
| Play together | `/lfg` `/event` `/voice` `/poll` `/giveaway` |
| Community | `/roles` `/reactionrole` `/suggest` `/tag` `/birthday` `/remind` `/afk` `/streamers` `/verify` |
| Moderation | `/warn` `/timeout` `/kick` `/ban` `/massban` `/unban` `/infractions` `/purge` `/lock` `/unlock` `/slowmode` `/raidmode` `/appeal` |
| Info | `/help` `/stats` `/serverinfo` `/userinfo` `/avatar` `/version` `/forgetme` |
| Admin | `/settings` |

`/help` builds its list from the commands that are loaded, so it never goes stale.

## Setup

You need Node.js 20.19 or newer, a MongoDB database, and a bot application from the Discord developer portal.

1. Clone the repo and run `npm install`.
2. Copy `.env.example` to `.env` and fill in `TOKEN`, `CLIENT_ID`, `GUILD_ID` and `MONGO_URI`. The shard manager refuses to start without `TOKEN` and `MONGO_URI`.
3. Set your community's timezone in `config.json`. Double XP days, the daily streak and birthdays all follow it.
4. In the developer portal, switch on the Server Members and Message Content privileged intents.
5. Run `npm start`. Slash commands register themselves on startup, and `AUTO_DEPLOY=false` turns that off if you would rather run `npm run deploy` by hand.

### Bot permissions

Invite the bot with View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Add Reactions, Use External Emojis, Manage Messages, Manage Roles, Manage Channels, Kick Members, Ban Members, Moderate Members, View Audit Log and Send Polls.

Join-to-create lobbies also need Connect and Move Members. Without them the bot logs one warning and leaves the hub alone. Its role must sit above any role it hands out (level roles, self roles, the verify role).

### First-time setup in Discord

Run these as someone with Manage Server.

1. `/settings set modLogChannelId <id>` for infractions, appeals and the audit log.
2. `/settings set announcementsChannelId <id>` for Double XP and update posts.
3. `/levelrewards milestones interval:10` to create the Level 10, 20, 30 roles on demand.
4. `/roles preset pack:platforms` and friends to create the self-assign roles.
5. `/settings set tempVoiceHubChannelId <voice channel id>` to turn on join-to-create lobbies.
6. `/verify setup role:@Member` then `/verify post channel:#rules` to put the age gate in front of your channels. With the gate on, new members stop getting the automatic member role, so lock your channels to the verify role first.

## Configuration

Secrets and IDs live in `.env`. Everything else is in `config.json`.

| Where | What |
| --- | --- |
| `.env` | Token, Mongo URI, Twitch and SteamGridDB keys, channel IDs, `ERROR_CHANNEL_ID` for error alerts, `MEMBER_ROLE_ID` for the automatic member role |
| `config.json` `xpSettings` | Base XP, length bonus, cooldown, voice tick, Double XP days, level cap |
| `config.json` `moderation.antiSpam` | Flood, mention and invite thresholds |
| `config.json` `tuning` | Polling intervals and the XP flush cadence |
| `/settings` | Per-server overrides, stored in the database |

## How it is put together

```
shard.js              sharding manager, env check, shutdown flush
src/index.js          client, caches with limits, Mongo reconnect loop, loaders
src/events/           one file per gateway event, wrapped so errors never go unhandled
src/commands/         slash commands, grouped by area
src/utils/            managers and pure helpers (XP buffer, auto-mod, event RSVP, temp voice)
src/database/         Mongoose schemas
tests/                Jest
```

A few choices worth knowing about.

- XP is buffered in memory and written with one bulk write per minute. A failed write opens a backoff window, requeues only the entries that failed, and caps the buffer, so a database outage cannot grow memory without limit.
- Every poller (giveaways, reminders, events, temp-bans, voice XP) runs through `utils/scheduler.js`, which never lets two ticks overlap and never lets a rejection escape.
- The bot retries the Mongo connection forever with a one minute ceiling, and the shard manager retries the gateway with backoff so a rate limit does not turn into a crash loop.
- Shutdown flushes voice sessions and the XP buffer before the process exits.

## Development

```bash
npm test        # Jest
npm run lint    # ESLint
npm run dev     # nodemon
npm run deploy  # register slash commands by hand
```

The test suite covers the pure logic (XP math, RSVP promotion, duration parsing, auto-mod decisions) and the Discord-facing handlers with small fakes. Please don't point a development copy at the production token, two bots on one token answer every command twice.

## Support the work

Free forever. If it saved you time, chip in.

- [Ko-fi](https://ko-fi.com/kkthnx)
- [Buy Me a Coffee](https://buymeacoffee.com/kkthnx)
- [PayPal](https://www.paypal.com/paypalme/kkthnxtv)

## Community

- Glitch Haven Discord: https://discord.gg/FaVGhTYmck
- Website: https://kkthnx.com

## License

Copyright (c) 2026 Kkthnx. All rights reserved. Proprietary. No permission is granted to use, copy, modify, distribute, or host this code without written permission. See [LICENSE](LICENSE).
