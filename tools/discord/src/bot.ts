import { Client, GatewayIntentBits, TextChannel } from 'discord.js'
import { loadConfig } from '../../cli/src/lib/config.js'

let client: Client | null = null

export async function getDiscordClient() {
  loadConfig()
  if (!process.env.DISCORD_BOT_TOKEN) return null
  if (client?.isReady()) return client
  client = new Client({ intents: [GatewayIntentBits.Guilds] })
  await client.login(process.env.DISCORD_BOT_TOKEN)
  return client
}

export async function sendNotification(message: string) {
  try {
    const activeClient = await getDiscordClient()
    if (!activeClient || !process.env.DISCORD_CHANNEL_ID) return
    const channel = await activeClient.channels.fetch(process.env.DISCORD_CHANNEL_ID)
    if (channel instanceof TextChannel) await channel.send(message)
  } catch {
    // DevTools notifications must never block local commands.
  }
}
