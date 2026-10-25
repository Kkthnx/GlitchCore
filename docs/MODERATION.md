# Moderation

How GlitchCore moderates, what it records, and the settings that control it. Everything here is per server and set with `/settings` unless noted.

## Commands

| Command | Permission | What it does |
| --- | --- | --- |
| `/warn` | Moderate Members | Records a warning and DMs the member. Can trigger strike escalation. |
| `/timeout` | Moderate Members | Discord timeout, up to 28 days. |
| `/kick` | Kick Members | Removes the member. |
| `/ban` | Ban Members | Permanent, or temporary with `duration` (up to 1 year). Works on users who already left. |
| `/massban` | Ban Members | Bans up to 25 IDs at once. Anyone still in the server goes through the same hierarchy check as `/ban`. |
| `/unban` | Ban Members | Lifts a ban and cancels any pending unban timer. |
| `/infractions view` | Moderate Members | Shows a member's history. |
| `/infractions clear` | Manage Server | Deletes a member's history. The clear itself is written to the mod-log. |
| `/purge` | Manage Messages | Bulk delete. The deleted messages are attached to the mod-log as a text file first. |
| `/raidmode on, off, release, status` | Manage Server | Holds new joins. See below. |
| `/appeal` | Everyone | Files an appeal into the mod-log. Rate limited to one per two minutes per member. |

Every action checks the role hierarchy. A moderator cannot act on themselves, the owner, the bot, or anyone with an equal or higher role.

## Order of operations

For `/kick`, `/ban` and `/timeout`:

1. Validate and check hierarchy, replying privately if blocked.
2. Acknowledge the command, so slow network calls cannot expire the 3 second reply window.
3. DM the member, then perform the action. If the action fails the DM is deleted again.
4. For bans, save or cancel the unban timer.
5. Write the infraction and post it to the mod-log.

The DM goes first because after a kick or ban the member usually shares no server with the bot, and Discord then refuses the message. If the infraction write fails after the action succeeded, the command says so and the action stands.

## Temp-bans

A temp-ban stores an unban time in the `TempBan` collection. A scheduler checks every 60 seconds and lifts due bans. It only handles guilds on its own shard.

- A failed unban (missing permission, network) keeps the record and retries next tick.
- An unban that already happened by hand (error 10026) clears the record.
- A permanent ban, `/massban`, or a ban or unban made directly in Discord cancels any older timer, so a stale timer cannot lift a ban that was meant to stand.

## Auto-mod

Runs on every message. Members with Manage Messages are exempt from anti-spam but not from the word filter.

| Check | Action |
| --- | --- |
| Word filter (slurs, politics, a spam word, CJK from young accounts) | Delete, short notice, `warn` infraction. Also runs on message edits. |
| Discord invite links | Delete, notice, `warn`. |
| Known phishing domains | Delete, notice, `warn`. |
| Too many mentions | Delete and timeout. |
| Message flooding | Delete and timeout. Attachments, stickers and custom emoji add weight. |
| Same message repeated | Delete every copy, in every channel, and timeout. |

A timeout infraction and the "timed out for spamming" notice are only written when Discord accepted the timeout.

### Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `antiSpamEnabled` | true | Invites, mentions, flooding, duplicates. |
| `contentFilterEnabled` | true | The word filter. |
| `autoModStrikes` | false | When on, warns issued by auto-mod count toward strike escalation. |
| `modLogChannelId` | none | Where infractions, appeals, purges and audit entries post. |
| `auditLogEnabled` | true | Posts Discord audit log entries to the mod-log. |
| `minAccountAgeDays` | 7 | Younger accounts are flagged on join, and CJK text from them is filtered. 0 turns it off. |
| `newAccountHoldMinutes` | 0 | Times out young accounts on join for this long. 0 only flags them. |
| `cjkExemptChannelIds` | none | Channels where the CJK filter never applies. |

Flood, mention and duplicate thresholds live in `config.json` under `moderation.antiSpam`.

## Strike escalation

When a member collects `strikeWarnThreshold` warns inside `strikeWindowDays`, `strikeAction` fires: `timeout`, `kick` or `ban`. Each further warn past the threshold fires it again. Threshold 0 turns it off.

| Key | Default |
| --- | --- |
| `strikeWarnThreshold` | 3 |
| `strikeWindowDays` | 30 |
| `strikeAction` | timeout |
| `strikeTimeoutMinutes` | 60 |

## Raid mode

Turns on by hand with `/raidmode on` or automatically when more than 10 members join in 20 seconds. While on, new joins get no auto-role, no welcome DM and no welcome post. State lives in memory, so a restart ends it.

Held members are remembered, up to 500 per server, even after raid mode ends. The usual cleanup is `/massban` the raiders, then `/raidmode release` to give the member role to everyone held who is still in the server. `/raidmode status` shows how many are waiting. If no member role is configured, release does nothing and keeps the list.

## Known limits

- Raid mode and the held list are per process and are lost on restart.
- The word filter matches whole words from a hand-written list. It will also catch legitimate uses of those words, for example a card game's "trump".
- The phishing list is short and curated by hand.
- Interactions have 15 minutes to finish after being acknowledged, which `/massban` stays well inside at 25 IDs.
