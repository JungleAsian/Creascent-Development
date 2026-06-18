// Only file permitted to send via the Facebook Messenger Send API.
// Sends a plain-text message through the Meta Graph API (Page-scoped).

const GRAPH_API_VERSION = 'v19.0'

/**
 * Send a text message via the Facebook Messenger Send API.
 *
 * @param pageAccessToken Page access token for the clinic's connected Facebook Page
 * @param recipientPsid   Page-scoped id of the recipient (the patient's PSID)
 * @param text            Message body
 */
export async function sendMessengerText(
  pageAccessToken: string,
  recipientPsid: string,
  text: string,
): Promise<void> {
  // Offline mode (LLM_STUB) — skip the network call so the whole pipeline runs
  // without Meta credentials, mirroring the WhatsApp/transcription stubs.
  if (process.env['LLM_STUB'] === 'true') return

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: recipientPsid },
      message: { text },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Messenger send failed ${res.status}: ${err}`)
  }
}
