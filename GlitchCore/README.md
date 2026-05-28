# GlitchCore

GlitchCore is a custom Discord bot built with [Discord.js](https://discord.js.org/) and Node.js. 

## Features
- **XP & Leveling System**: Earn XP through text messages and voice chat, including double XP days.
- **Configurable Settings**: Easily manage roles, channels, and theme colors.
- **Canvas Integrations**: Uses `@napi-rs/canvas` for image manipulation and generation.

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
   Create a `.env` file in the root directory and add your bot token and database URI:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   MONGO_URI=your_mongodb_uri_here
   ```
4. Update `config.json` with your specific channel and role IDs.

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
