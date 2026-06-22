// Consumes: workflow-run queue (Rev 3 phase 2b — N8N-style automation workflows).
//
// Loads the active workflow, builds real executors over the clinic's channels +
// repositories, and walks the node graph via the pure engine (@docmee/agents). Send
// executors re-check consent + an active WhatsApp account at run time (the producer
// only wires the reactive message_keyword trigger today, so sends are inside Meta's
// care window). Delay nodes re-enqueue to resume; approval / ai_draft alert a
// secretary in v1 (full approve-and-resume round-trip is phase 3).
import { runWorkflow, type WorkflowContext, type WorkflowExecutors } from '@docmee/agents'
import { sendWhatsAppText } from '@docmee/channels'
import { type Job } from '@docmee/queue'
import {
  createServiceDbClient,
  createPatientsRepository,
  createChannelAccountsRepository,
  createConversationsRepository,
  createMessagesRepository,
  createMessageTemplatesRepository,
  createNotificationsRepository,
  createWorkflowsRepository,
  type Patient,
  type ChannelAccount,
  type PatientContact,
  type MessageTemplateCategory,
} from '@docmee/db'
import { WorkflowRunJobSchema, scheduleWorkflowResume, type WorkflowRunJobData } from './workflow-run.js'

type Sql = ReturnType<typeof createServiceDbClient>

function isPatientOptedOut(patient: Patient): boolean {
  return (patient.metadata as { optedOut?: unknown }).optedOut === true
}
function activeWhatsAppAccount(accounts: ChannelAccount[]): ChannelAccount | undefined {
  return accounts.find((a) => a.channel === 'whatsapp' && a.status === 'active')
}
function primaryWhatsAppHandle(contacts: PatientContact[]): string | null {
  const whatsapp = contacts.filter((c) => c.channel === 'whatsapp')
  return (whatsapp.find((c) => c.isPrimary) ?? whatsapp[0])?.contactHandle ?? null
}

/** Resolve a sendable WhatsApp target for the trigger's patient, or null when we
 *  must not send (opted out, no active account, no handle). */
async function resolveTarget(
  sql: Sql,
  clinicId: string,
  patientId: string | undefined,
): Promise<{ account: ChannelAccount; handle: string } | null> {
  if (!patientId) return null
  const patient = await createPatientsRepository(sql).findById(clinicId, patientId)
  if (!patient || isPatientOptedOut(patient)) return null
  const account = activeWhatsAppAccount(await createChannelAccountsRepository(sql).listByClinic(clinicId))
  if (!account) return null
  const handle = primaryWhatsAppHandle(await createPatientsRepository(sql).listContacts(clinicId, patientId))
  if (!handle) return null
  return { account, handle }
}

async function persistOutbound(sql: Sql, clinicId: string, conversationId: string | undefined, text: string, wamid: string | null): Promise<void> {
  if (!conversationId) return
  try {
    await createMessagesRepository(sql).create({
      conversationId,
      clinicId,
      role: 'assistant',
      content: text,
      ...(wamid ? { channelMessageId: wamid } : {}),
      metadata: { channel: 'whatsapp', source: 'workflow' },
    })
  } catch (err) {
    console.error('[workflow] failed to persist outbound message:', err)
  }
}

function buildExecutors(sql: Sql, data: WorkflowRunJobData): WorkflowExecutors {
  const { clinicId } = data
  const notify = async (content: string, ctx: WorkflowContext) =>
    void (await createNotificationsRepository(sql).create({
      clinicId,
      alertType: 'workflow',
      recipient: 'secretary',
      content,
      ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
    }))

  return {
    async sendMessage(text, ctx) {
      if (!text.trim()) return
      const target = await resolveTarget(sql, clinicId, ctx.patientId)
      if (!target) {
        console.log(`[workflow] no sendable WhatsApp target for clinic ${clinicId}; skipping send`)
        return
      }
      const wamid = await sendWhatsAppText(target.account.accountId, target.account.accessTokenEnc ?? '', target.handle, text)
      await persistOutbound(sql, clinicId, ctx.conversationId, text, wamid)
    },

    async sendTemplate(category, ctx) {
      if (!category) return
      const template = await createMessageTemplatesRepository(sql).findApprovedByCategory(
        clinicId,
        category as MessageTemplateCategory,
      )
      if (!template) {
        console.log(`[workflow] no approved template for category "${category}"; skipping`)
        return
      }
      const target = await resolveTarget(sql, clinicId, ctx.patientId)
      if (!target) return
      const wamid = await sendWhatsAppText(target.account.accountId, target.account.accessTokenEnc ?? '', target.handle, template.body)
      await persistOutbound(sql, clinicId, ctx.conversationId, template.body, wamid)
    },

    async notifySecretary(ctx) {
      await notify('A workflow flagged this conversation for attention.', ctx)
    },

    async addTag(tag, ctx) {
      if (!tag || !ctx.conversationId) return
      const conversations = createConversationsRepository(sql)
      const conv = await conversations.findById(clinicId, ctx.conversationId)
      if (!conv) return
      const existing = ((conv.metadata as { tags?: unknown }).tags as string[] | undefined) ?? []
      if (existing.includes(tag)) return
      await conversations.update(clinicId, ctx.conversationId, { metadata: { ...conv.metadata, tags: [...existing, tag] } })
    },

    async aiDraft(prompt, ctx) {
      // v1: surface the draft instruction to a secretary. Phase 3 runs the bot to
      // produce a draft reply and parks it for approval.
      await notify(`Workflow requests an AI draft: ${prompt || '(no prompt)'}`, ctx)
    },

    async requestApproval(_node, ctx) {
      // v1: alert a secretary. Phase 3 stores a resumable pending-approval row.
      await notify('A workflow step requires your approval before continuing.', ctx)
    },

    async scheduleResume(nodeId, ms) {
      if (!nodeId) return
      await scheduleWorkflowResume(data, nodeId, ms)
    },
  }
}

export async function processWorkflowRunJob(job: Job): Promise<void> {
  const data = WorkflowRunJobSchema.parse(job.data)
  const sql = createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })
  try {
    const workflow = await createWorkflowsRepository(sql).findById(data.clinicId, data.workflowId)
    if (!workflow || workflow.status !== 'active') {
      console.log(`[workflow] ${data.workflowId} not active; skipping run`)
      return
    }
    const ctx: WorkflowContext = { ...data.trigger }
    const exec = buildExecutors(sql, data)
    const trace = await runWorkflow(workflow, ctx, exec, data.startNodeId ? { startNodeId: data.startNodeId } : {})
    console.log(`[workflow] ${workflow.name} ran ${trace.length} step(s) for clinic ${data.clinicId}`)
  } finally {
    await sql.end()
  }
}
