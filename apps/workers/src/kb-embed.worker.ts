// Consumes: kb-embed queue. Embeds a knowledge-base chunk and persists the vector.
import { z } from 'zod'
import { type Job } from '@docmee/queue'
import { embedText } from '@docmee/llm'
import { createServiceDbClient, toJson } from '@docmee/db'

const JobSchema = z.object({
  chunkId: z.string(),
  clinicId: z.string(),
  content: z.string(),
})

export async function processKbEmbedJob(job: Job): Promise<void> {
  const data = JobSchema.parse(job.data)
  const embedding = await embedText(data.content)
  const sql = createServiceDbClient({ url: process.env['DATABASE_URL'] ?? '' })
  try {
    await sql`
      UPDATE knowledge_chunks
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'),
        '{embedding}',
        ${sql.json(toJson({ v: embedding }))}::jsonb
      )
      WHERE id = ${data.chunkId} AND clinic_id = ${data.clinicId}
    `
  } finally {
    await sql.end()
  }
}
