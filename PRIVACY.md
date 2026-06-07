# GlitchCore Privacy Policy

_Last updated: 2026-06-07_

GlitchCore ("the bot") is a Discord bot that provides leveling, voice/text XP,
moderation, and looking-for-group (LFG) features. This policy explains what
data the bot stores and how it is handled, in line with the
[Discord Developer Terms of Service](https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service).

## Data We Store

The bot stores the minimum data required to operate its features:

| Data | Purpose |
| :--- | :--- |
| Discord User ID + Guild ID | Associates XP, level, and rank-card style with you in a given server. |
| XP, level, total message count | Powers the leveling system, `/rank`, and `/leaderboard`. |
| Rank-card style preference | Renders your chosen `/rankstyle` theme. |
| LFG session data (host/roster user IDs, game, activity) | Powers active looking-for-group posts; deleted when the session is locked, cancelled, or expires. |
| Bot state (e.g. last double-XP announcement date) | Prevents duplicate announcements across restarts. |

We do **not** store message content. Message text is processed in memory only
(for XP calculation and the auto-moderation filter) and is never persisted.

## Data We Do Not Collect

- We do not sell or share your data with third parties.
- We do not store IP addresses, payment information, or direct messages.

## Data Retention & Deletion

- **Automatic guild cleanup:** When the bot is removed from a server, all data
  associated with that server (user XP records, LFG sessions, and bot state) is
  automatically and permanently deleted.
- **LFG sessions** are ephemeral and removed once locked, cancelled, or after
  one hour of inactivity.
- **Manual deletion requests:** To request deletion of your data, contact a
  server administrator or the bot operator.

## Contact

For privacy questions or data-deletion requests, please contact the bot
operator through the Discord server where GlitchCore is installed.
