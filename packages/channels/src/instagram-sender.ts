// Only file permitted to send via the Instagram Messaging API.
// Instagram DM uses the same Graph Send API as Messenger — same Page access
// token, same /me/messages endpoint — keyed by the recipient's IGSID.

const GRAPH_API_VERSION = 'v19.0'

/**
 * Send a text message via the Instagram Messaging API.
 *
 * @param pageAccessToken Page access token for the Facebook Page linked to the
 *                        clinic's Instagram Business account
 * @param recipientIgsid  Instagram-Scoped id of the recipient (the patient)
 * @param text            Message body
 */
export async function sendInstagramText(
  pageAccessToken: string,
  recipientIgsid: string,
  text: string,
): Promise<void> {
  // Offline mode (LLM_STUB) — skip the network call so the whole pipeline runs
  // without Meta credentials, mirroring the WhatsApp/Messenger/transcription stubs.
  if (process.env['LLM_STUB'] === 'true') return

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: recipientIgsid },
      message: { text },
      messaging_type: 'RESPONSE',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Instagram send failed ${res.status}: ${err}`)
  }
}
