import { Client, GatewayIntentBits } from 'discord.js'
import { loadConfig } from '../../cli/src/lib/config.js'

let client: Client | null = null

export type DiscordNotificationType = 'critical' | 'development' | 'approval'

const channelEnvByType: Record<DiscordNotificationType, string> = {
  critical: 'DISCORD_CRITICAL_CHANNEL_ID',
  development: 'DISCORD_UPDATE_CHANNEL_ID',
  approval: 'DISCORD_APPROVAL_CHANNEL_ID'
}

const labelByType: Record<DiscordNotificationType, string> = {
  critical: 'Critical/Important',
  development: 'Development Update',
  approval: 'Approval'
}

export async function getDiscordClient() {
  loadConfig()
  const botToken = process.env.DISCORD_MESSAGING_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN
  if (!botToken) return null
  if (client?.isReady()) return client
  client = new Client({ intents: [GatewayIntentBits.Guilds] })
  await client.login(botToken)
  return client
}

export async function closeDiscordClient() {
  if (!client) return
  client.destroy()
  client = null
}

function channelIdForType(type: DiscordNotificationType) {
  return process.env[channelEnvByType[type]] || process.env.DISCORD_CHANNEL_ID
}

export async function sendNotification(message: string, type: DiscordNotificationType = 'development') {
  try {
    const activeClient = await getDiscordClient()
    const channelId = channelIdForType(type)
    if (!activeClient || !channelId) return false
    const channel = await activeClient.channels.fetch(channelId)
    if (!channel?.isTextBased() || !('send' in channel)) return false
    await channel.send(`**${labelByType[type]}**\n${message}`)
    return true
  } catch {
    // DevTools notifications must never block local commands.
    return false
  }
}
