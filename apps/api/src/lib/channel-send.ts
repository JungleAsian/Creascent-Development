// Outbound text send for the three Meta channels (Req 3/33/34). Inlined here —
// mirroring whatsapp-media.ts — so apps/api needn't depend on @docmee/channels
// (whose barrel also pulls in the transcription/Deepgram provider). These are
// faithful copies of @docmee/channels' senders: each returns the provider message
// id (WhatsApp wamid / Messenger + Instagram mid) so a manual reply persists a
// channel_message_id and the delivery-status pipeline can match Meta's
// sent/delivered/read/failed receipts back to it. A missing id in the response
// yields null — the send itself still succeeded.

const GRAPH_API_VERSION = 'v19.0'

/** Send a plain-text WhatsApp Cloud API message; returns the wamid (or null). */
export async function sendWhatsAppText(
  phoneNumberId: string,
  accessToken: string,
  toWaId: string,
  text: string,
): Promise<string | null> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toWaId,
        type: 'text',
        text: { body: text },
      }),
    },
  )

  if (!res.ok) {
    throw new Error(`WhatsApp send failed ${res.status}: ${await res.text()}`)
  }

  try {
    const data = (await res.json()) as { messages?: Array<{ id?: string }> }
    return data.messages?.[0]?.id ?? null
  } catch {
    return null
  }
}

/**
 * Send an approved WhatsApp message template (HSM); returns the wamid (or null).
 * A real `type:'template'` message is the ONLY way to reach a patient outside
 * Meta's 24-hour customer-care window (Req 3/14/19). `templateName` + `language`
 * must match a template Meta has approved for the clinic's number; this sends the
 * base template with no variable parameters (the catalogued bodies are static).
 */
export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  accessToken: string,
  toWaId: string,
  templateName: string,
  languageCode: string,
): Promise<string | null> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toWaId,
        type: 'template',
        template: { name: templateName, language: { code: languageCode } },
      }),
    },
  )

  if (!res.ok) {
    throw new Error(`WhatsApp template send failed ${res.status}: ${await res.text()}`)
  }

  try {
    const data = (await res.json()) as { messages?: Array<{ id?: string }> }
    return data.messages?.[0]?.id ?? null
  } catch {
    return null
  }
}

/** Send a plain-text Messenger Send API message; returns the mid (or null). */
export async function sendMessengerText(
  pageAccessToken: string,
  recipientPsid: string,
  text: string,
): Promise<string | null> {
  // Offline mode (LLM_STUB) — skip the network call so the stack runs without
  // Meta credentials, mirroring @docmee/channels.
  if (process.env['LLM_STUB'] === 'true') return null

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
    throw new Error(`Messenger send failed ${res.status}: ${await res.text()}`)
  }

  try {
    const data = (await res.json()) as { message_id?: string }
    return data.message_id ?? null
  } catch {
    return null
  }
}

/** Send a plain-text Instagram DM (same Graph Send API); returns the mid (or null). */
export async function sendInstagramText(
  pageAccessToken: string,
  recipientIgsid: string,
  text: string,
): Promise<string | null> {
  if (process.env['LLM_STUB'] === 'true') return null

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
    throw new Error(`Instagram send failed ${res.status}: ${await res.text()}`)
  }

  try {
    const data = (await res.json()) as { message_id?: string }
    return data.message_id ?? null
  } catch {
    return null
  }
}
