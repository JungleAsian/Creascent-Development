import { sendNotification } from '../bot.js'

export async function notifyCostAlert(spend: number, threshold: number) {
  await sendNotification(`Cost alert - Daily spend $${spend.toFixed(2)} exceeded threshold $${threshold.toFixed(2)}`, 'critical')
}
