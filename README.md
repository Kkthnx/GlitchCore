# GlitchCore

The custom Discord bot for the Glitch Haven gaming community, built with Discord.js v14 and Node.js. It runs under a sharding manager, stores data in MongoDB, and auto-deploys its slash commands on startup.

## What it does

- XP and leveling from text and voice chat, rank cards (`/rank`), level roles, daily streaks, and opt-in Double XP days.
- Community tools: self-assign roles, reaction roles, game nights with RSVP, birthdays, LFG lobbies, polls, giveaways, suggestions, reminders, and streamer go-live announcements.
- Full moderation suite: warn, timeout, kick, ban (with temp-ban durations), an infraction log, purge, and audit logging to a mod-log channel.
- Anti-raid and anti-spam: auto-detects invite links, mass mentions, and message flooding, with content filters and themed clapbacks.
- Privacy built in: `/forgetme` exports or deletes a user's data, and all per-guild data is purged when the bot leaves a server.

## Get it

GlitchCore is self-hosted. You need Node.js v20 or newer, a MongoDB instance, and a Discord bot token with the Server Members and Message Content privileged intents enabled.

1. Clone the repo and run `npm install`.
2. Copy `.env.example` to `.env` and fill in your token, client IDs, and MongoDB URI.
3. Set your community's timezone in `config.json`.
4. Run `npm start`. Slash commands register on startup.

See PRIVACY.md for the data-handling policy.

## Quick start

1. Finish the setup above and run `npm start`.
2. Use `/settings` to set your mod-log, welcome, and announcements channels.
3. Use `/levelrewards` to set up milestone roles and `/event create` to schedule your first game night.

## Support the work

Free forever. If it saved you time, chip in:

- [Ko-fi](https://ko-fi.com/kkthnx)
- [Buy Me a Coffee](https://buymeacoffee.com/kkthnx)
- [PayPal](https://www.paypal.com/paypalme/kkthnxtv)

Every bit goes back into building more.

## Community

- Glitch Haven Discord: https://discord.gg/FaVGhTYmck
- Website: https://kkthnx.com

## License

Copyright (c) 2026 Kkthnx. All rights reserved. Proprietary. No permission is granted to use, copy, modify, distribute, or host this code without written permission. See [LICENSE](LICENSE).
