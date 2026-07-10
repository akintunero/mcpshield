# Slack Integration

MCPShield communicates via a Slack bot using Socket Mode, which requires no public-facing URLs.

## Creating the Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name it `MCPShield` and select your workspace

## Socket Mode

1. Navigate to **Socket Mode** in the sidebar
2. Toggle **Enable Socket Mode**
3. Create an app-level token named `mcpshield-token` with scope `connections:write`
4. Save the token (starts with `xapp-`)

## Bot Token Scopes

Navigate to **OAuth & Permissions** → **Scopes** → **Bot Token Scopes** and add:

- `app_mentions:read` — Hear when the bot is mentioned
- `chat:write` — Send messages to channels

## Event Subscriptions

1. Navigate to **Event Subscriptions**
2. Toggle **Enable Events**
3. Under **Subscribe to bot events**, add `app_mention`

## Install App

1. Click **Install to Workspace**
2. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
3. Copy the **Signing Secret** from **Basic Information**

## Configuration

Add these to your `.env`:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-level-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_ALLOWED_CHANNEL=    # Optional: restrict to single channel
```

## Supported Commands

See [agent.md](./agent.md) for the full command reference.

## Workshop Tips

- Use a dedicated Slack workspace for the workshop
- Create a `#mcpshield-demo` channel and invite the bot
- The bot responds to `@Shield` mentions
