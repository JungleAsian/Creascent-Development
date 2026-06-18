// Consumes: agent queue.
// Classifies intent, routes to the correct platform agent, enqueues downstream work.
import { z } from 'zod'
import { classifyIntent } from '@docmee/llm'
import { routeIntent } from '@docmee/agents'
import { schedulingQueue, notificationQueue, type Job } from '@docmee/queue'

const AgentJobSchema = z.object({
  clinicId: z.string().uuid(),
  patientWaId: z.string(),
  message: z.string(),
  waMessageId: z.string(),
  conversationId: z.string().uuid().optional(),
})

export type AgentJobData = z.infer<typeof AgentJobSchema>

export async function processAgentJob(job: Job): Promise<void> {
  const data = AgentJobSchema.parse(job.data)
  const intent = await classifyIntent(data.message)

  const route = routeIntent(intent, {
    isInsideBusinessHours: true, // TODO P05: check clinic business hours
    patientOptedOut: false, // TODO P05: check patient.opted_out
  })

  switch (route.agent) {
    case 'calbot':
      await schedulingQueue.add('schedule', { ...data, action: route.action })
      break
    case 'alertflow':
      await notificationQueue.add('notify', { ...data, reason: route.reason })
      break
    case 'silence':
      // Log and stop — no reply is sent.
      console.log('[agent] silence route:', route.reason, data.clinicId)
      break
    case 'botbase':
      // TODO P05: call clinic bot → send WhatsApp reply.
      console.log('[agent] botbase route — intent:', intent)
      break
  }
}
