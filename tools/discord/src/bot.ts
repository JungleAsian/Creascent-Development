import { Client, GatewayIntentBits } from 'discord.js'
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

export async function closeDiscordClient() {
  if (!client) return
  client.destroy()
  client = null
}

export async function sendNotification(message: string) {
  try {
    const activeClient = await getDiscordClient()
    if (!activeClient || !process.env.DISCORD_CHANNEL_ID) return false
    const channel = await activeClient.channels.fetch(process.env.DISCORD_CHANNEL_ID)
    if (!channel?.isTextBased() || !('send' in channel)) return false
    await channel.send(message)
    return true
  } catch {
    // DevTools notifications must never block local commands.
    return false
  }
}
