# GlitchCore

GlitchCore is a custom Discord bot built with [Discord.js](https://discord.js.org/) and Node.js.

## Features

- **XP & Leveling System**: Earn XP through text messages and voice chat, including double XP days (max level 1000).
- **Milestone Level-Roles**: `/levelrewards milestones interval:10` auto-creates and grants a prestige role every N levels (rank or stacking mode).
- **Opt-in Double XP role**: Announcements ping a self-assigned `@DoubleXP` role instead of `@everyone` (falls back to `@everyone` if unset).
- **Self-Assign Roles**: `/roles` menu + postable panels so members pick the games they play and the pings they want.
- **Moderation Suite**: `/warn`, `/timeout`, `/kick`, `/ban`, and `/infractions` with a persistent infraction log and an optional mod-log channel.
- **Anti-Raid / Anti-Spam**: Auto-detects invite links, mass mentions, and message flooding; auto-timeouts offenders (per-guild toggle).
- **Game-Night Events**: `/event create` schedules a session with RSVP buttons (Going/Maybe/Can't), an auto-promoting waitlist, and a roster ping at start time (timezone-correct).
- **LFG System**: Slash-command-driven looking-for-group lobbies with live roster buttons.
- **Privacy**: `/forgetme export` downloads a user's stored data; `/forgetme delete` erases their profile on confirmation.
- **Auto-Moderation**: Configurable content filter.
- **Configurable Settings**: Easily manage roles, channels, and theme colors via `config.json`.
- **Canvas Integrations**: Uses `@napi-rs/canvas` for image manipulation and generation.
- **Structured Logging**: Winston-based logging with automatic secret redaction.

See [PRIVACY.md](./PRIVACY.md) for the data-handling policy.

## Testing

Run the unit test suite with:

```bash
npm test
```

## Prerequisites

- Node.js (v16.9.0 or newer recommended)
- MongoDB instance (Mongoose)
- A Discord Bot Token

## Installation

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure your environment:
   Copy `.env.example` to `.env` and fill in the values:

   ```bash
   cp .env.example .env
   ```

   Example values:

   ```env
   TOKEN=your_bot_token_here
   CLIENT_ID=your_application_client_id
   GUILD_ID=your_dev_guild_id
   MONGO_URI=your_mongodb_uri_here
   # Optional: enables LFG game banners
   STEAMGRIDDB_API_KEY=your_steamgriddb_key
   # Optional: set to "production" for JSON structured logs
   NODE_ENV=development
   LOG_LEVEL=info
   ```

4. Update `config.json` with your specific channel and role IDs. Set
   `timezone` (an IANA name like `America/New_York`) to your community's
   timezone — Double XP days, the announcement, and its once-per-day dedup
   are all evaluated in this timezone, so the host server can run in UTC
   without the weekend posting early or re-posting on restart.

## Usage

Start the bot normally:

```bash
npm start
```

For development (using nodemon):

```bash
npm run dev
```

Deploy slash commands:

```bash
npm run deploy
```

Windows users can also simply run the `start_bot.bat` script to launch the bot.

## License

ISC
