# GlitchCore Privacy Policy

_Last updated: 2026-09-24_

GlitchCore ("the bot") is a Discord bot that provides leveling, voice/text XP,
moderation, events, and looking-for-group (LFG) features. This policy explains
what data the bot stores and how it is handled, in line with the
[Discord Developer Terms of Service](https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service).

Everything below is stored per server. The bot keeps no data that spans servers,
and no data at all about servers it is not in.

## Data We Store

| Data | Stored because | Removed by `/forgetme delete` |
| :--- | :--- | :--- |
| Discord User ID + Server ID | Associates everything below with you in a given server. | Yes |
| XP, level, total message count | Powers leveling, `/rank` and `/leaderboard`. | Yes |
| Rank-card style preference | Renders your chosen `/rankstyle` theme. | Yes |
| Daily streak + last claim date | Powers `/daily` streak rewards. | Yes |
| Birthday (month and day, **no year**) | Powers the birthday shoutout, if you opt in with `/birthday set`. | Yes |
| Reminders you set (**the text you wrote**, channel, due time) | Delivers `/remind`. Deleted automatically once delivered. | Yes |
| Event RSVPs (your user ID and display name) | Shows the roster on a game-night post and pings it at start time. | Yes |
| LFG roster and waitlist entries (user ID, display name) | Powers active LFG posts. Deleted when the session locks, is cancelled, or expires. | Yes |
| Giveaway entries | Records that you entered, so the draw is fair. | Yes |
| Twitch channel link, if an admin links a tracked channel to your account | Credits you on go-live announcements. | The link, yes; the channel itself is server config |
| Suggestions you post (**the text you wrote**, vote tallies) | Published to the suggestion channel like a message. | **No**, see below |
| Moderation records (type, reason, moderator, duration) | A server's own record of moderation actions. | **No**, see below |
| Tags you author (**the text you wrote**) | Saved canned responses for the whole server. A manager can delete one with `/tag delete`. | No, managed by the server |
| Starboard entries (message IDs only, no content) | Keeps a highlighted message's star count in sync. Removed when the original message is deleted. | No, keyed to a message not a person |
| Server settings and bot state (channel/role IDs, last announcement dates) | Configuration. Contains no personal data. | Not applicable |

### About message content

The bot does **not** store the content of ordinary chat messages. Message text is
processed in memory only, for XP calculation and the auto-moderation filter, and
is never written to the database.

It does store text you deliberately submit to a bot feature: the body of a
`/remind`, a `/suggest`, or a `/tag`. Those are listed above.

For transparency: the auto-moderation filter and the audit log post a copy of a
deleted or edited message into the server's mod-log channel, and the starboard
reposts a highlighted message into the highlights channel. Those copies are
Discord messages in your server, not bot storage, and are subject to your
server's own retention.

## Data We Do Not Collect

- We do not sell or share your data with third parties.
- We do not store IP addresses or payment information.
- We do not read or store your direct messages. The bot only sends DMs
  (moderation notices, waitlist promotions, and a welcome message).

## Your Controls

- **`/forgetme export`** downloads everything the bot stores about you in that
  server, as a JSON file, visible only to you.
- **`/forgetme delete`** erases it, after an explicit confirmation. The table
  above says exactly what this covers.

## Retention

- **Automatic server cleanup:** when the bot is removed from a server, all data
  associated with that server is permanently deleted across every collection
  listed above, including moderation records.
- **Reminders** are deleted as soon as they are delivered.
- **LFG sessions** are removed once locked, cancelled, or after one hour of
  inactivity.
- **Events** are removed a couple of hours after they start, or immediately when
  cancelled.
- **Starboard entries** are removed when the original message is deleted.
- Everything else is kept until you erase it, or the bot leaves the server.

### Why two things survive a deletion request

**Moderation records** are retained as the server's own record of actions its
moderators took. If a member could erase their own history on request, the
record would be worthless. `/forgetme delete` reports how many were kept.

**Suggestions** are content you published to a channel for the community to vote
on, in the same way a message is. Erasing the author link would leave an
unattributed post; deleting the post is a moderation decision, so ask a server
manager and they can remove it.

## Contact

For privacy questions, or to ask for something the controls above don't cover,
contact the bot operator through the Discord server where GlitchCore is
installed.
