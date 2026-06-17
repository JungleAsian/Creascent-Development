import { Command } from 'commander'
import { closeDiscordClient, sendNotification } from '../../../discord/src/bot.js'
import { log } from '../lib/logger.js'

export const discordCmd = new Command('discord').description('Send DevTools Discord notifications')

discordCmd.command('test').action(async () => {
  try {
    const sent = await sendNotification(`Docmee DevTools test notification - ${new Date().toLocaleString()}`)
    if (!sent) {
      log('discord', 'Test notification failed. Check DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID, and bot channel access.', 'warn')
      process.exitCode = 1
      return
    }
    log('discord', 'Test notification sent')
  } finally {
    await closeDiscordClient()
  }
})
