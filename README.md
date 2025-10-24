# Discord Ticket Bot

A Discord.js v14 ticket system with mod‑log, transcripts, cooldowns, and duplicate‑panel protection.

## Features
- Ticket panel with buttons for `Support`, `Köp`, `Övrigt`, `Panel`.
- Slash commands: `/ticket ban`, `/ticket unban`, `/close <ticket_id>`.
- Mod‑log embeds for banned‑attempts, bans, unbans, closes, unauthorized closes.
- Per‑user cooldowns: create 15s; staff moderation 5s; close (command & button) 5s.
- HTML transcript generation posted to a transcript channel.
- Transcript is also DM’d to the ticket opener on close (if DMs are open).
- Auto‑deletes the ticket channel after close (configurable delay).
- Persistent panel memory: stores the panel message id to avoid duplicate panels after restarts.

## Requirements
- Node.js 18+ (recommended).
- A Discord application/bot added to your server.
- MySQL reachable from the bot.

## Environment Variables (.env)
Set these before running:
- `BOT_TOKEN` – Discord bot token
- `TICKET_CHANNEL_ID` – Channel for the ticket panel
- `SUPPORT_CATEGORY_ID`, `KOP_CATEGORY_ID`, `OVRIGT_CATEGORY_ID`, `PANEL_CATEGORY_ID` – Category ids for ticket channels
- `SUPPORT_ROLE_IDS` – Comma‑separated role ids allowed to close tickets (fallback to `SUPPORT_ROLE_ID`)
- `TRANSCRIPT_CHANNEL_ID` – Channel for HTML transcripts (optional but recommended)
- `MOD_LOG_CHANNEL_ID` – Channel for moderation logs (optional)
- `GUILD_ID` – If set, register commands only in this guild; otherwise global
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` – MySQL connection
- `TICKET_DELETE_DELAY_MS` – Delay before auto‑deleting a ticket channel after close (default `5000`)

Example for multiple support roles:
- `SUPPORT_ROLE_IDS=985283578982195372, 985283646611136573`

Example `.env` snippet:
```
BOT_TOKEN=your-bot-token
TICKET_CHANNEL_ID=123456789012345678
SUPPORT_ROLE_IDS=985283578982195372, 985283646611136573
TRANSCRIPT_CHANNEL_ID=123456789012345678
MOD_LOG_CHANNEL_ID=123456789012345678
GUILD_ID=your-guild-id
DB_HOST=localhost
DB_USER=discord
DB_PASSWORD=secret
DB_NAME=discordbot
DB_PORT=3307
TICKET_DELETE_DELAY_MS=5000
```


## Install & Run
1. `npm install`
2. Ensure `.env` is configured.
3. `node Ticketbot.js`
4. Watch logs for: bot login and slash command registration.

## Commands & Flow
- Click a panel button → modal → ticket channel created under the mapped category.
- `/ticket ban @user [reason]` – prevents user from opening tickets (logged to mod‑log).
- `/ticket unban @user` – removes ban (logged).
- `/close <ticket_id>` or close button – closes ticket, generates transcript, updates DB, logs to mod‑log.

## Cooldowns & Logging
- Create: 15s per user; Staff moderation: 5s; Close: 5s.
- Mod‑log includes actor, target, channel, ticket id, and reason when available.

## Transcripts
- Bot fetches channel history, builds an HTML transcript, and posts it in `TRANSCRIPT_CHANNEL_ID`.
- Transcript is also DM’d to the ticket opener on close (if DMs are open).

## Close Flow
- Staff closes via `/close <ticket_id>` or the close button.
- Bot generates the HTML transcript and posts in `TRANSCRIPT_CHANNEL_ID`.
- Bot DMs the opener with the embed and the transcript.
- Bot updates DB status to `Stängd` and removes opener’s view permission.
- Bot posts a final embed in the channel and schedules deletion.
- Channel is deleted after `TICKET_DELETE_DELAY_MS` (default 5s).

## Panel Persistence
- File `panel_state.json` is created automatically to store `{ channelId, messageId }`.
- On restart the bot fetches that message and skips posting a new panel.
- To force a new panel: delete `panel_state.json` and the old panel message.

## Notable Fixes & Improvements
- Replaced deprecated `avatarURL()` with `displayAvatarURL()`.
- Guarded permission overwrites; supports multiple support roles via `SUPPORT_ROLE_IDS`.
- Switched button styles to `ButtonStyle` enums.
- Removed duplicate top‑level command registration (fixed `await` syntax error).
- Added duplicate panel protection and persistent memory.

## Troubleshooting
- Commands not showing: check `GUILD_ID`, bot permissions, and give Discord a minute for global commands.
- Mod‑log/transcript warnings: set corresponding channel ids in `.env`.
- DMs missing: users may have server DMs disabled — transcript still posts to `TRANSCRIPT_CHANNEL_ID`.
- Channel not deleted: ensure the bot has `Manage Channels` and `View Channel` in the ticket category; check `TICKET_DELETE_DELAY_MS` (default 5000).
- Permission errors closing tickets: verify `SUPPORT_ROLE_IDS` (or `SUPPORT_ROLE_ID`) and role assignment.

## Roadmap
- Log ticket creation/open events to mod‑log.
- Add `/ticket escalate`, `/ticket reopen`, and `/ticket stats`.
- Persist cooldowns (e.g., Redis/MySQL) for multi‑instance setups.
