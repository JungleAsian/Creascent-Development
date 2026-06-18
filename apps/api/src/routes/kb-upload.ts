// P18 (Gap #33): Document training — upload a clinic document (PDF / Word / text /
// FAQ), extract + chunk it, persist as a knowledge document, and enqueue each chunk
// for embedding.
//   POST /clinics/:id/kb/upload   (clinic_admin, ia_studio_admin) — multipart/form-data: file
import type { FastifyPluginAsync } from 'fastify'
import multipart from '@fastify/multipart'
import { createKnowledgeRepository } from '@docmee/db'
import { kbEmbedQueue } from '@docmee/queue'
import { trainDocument, detectFormat } from '@docmee/agents'
import { withDb } from '../lib/db.js'
import { resolveClinicScope } from '../lib/scope.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

const kbUploadRoute: FastifyPluginAsync = async (app) => {
  // Multipart is encapsulated to this plugin (Fastify parsers are per-plugin), so it
  // never interferes with the JSON body parsing the rest of the API relies on.
  await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES } })
  app.addHook('preHandler', requireAuth)

  app.post<{ Params: { id: string } }>(
    '/clinics/:id/kb/upload',
    { preHandler: requireRole('clinic_admin', 'ia_studio_admin') },
    async (request, reply) => {
      const clinicId = resolveClinicScope(request, request.params.id)
      if (!clinicId) return reply.code(403).send({ error: 'Forbidden' })

      const file = await request.file()
      if (!file) return reply.code(400).send({ error: 'No file uploaded' })

      const buffer = await file.toBuffer()
      const format = detectFormat(file.filename, file.mimetype)

      let chunks
      try {
        chunks = await trainDocument({ buffer, format })
      } catch (err) {
        request.log.error({ err }, 'document training failed')
        return reply.code(422).send({ error: 'Could not extract text from the document' })
      }
      if (chunks.length === 0) return reply.code(422).send({ error: 'Document has no extractable content' })

      const { document, stored } = await withDb(async (sql) => {
        const repo = createKnowledgeRepository(sql)
        const doc = await repo.createDocument({
          clinicId,
          title: file.filename || 'Uploaded document',
          content: chunks.map((c) => c.content).join('\n\n'),
          documentType: 'custom',
          status: 'active',
          metadata: { source: 'document', format },
        })
        const rows = []
        for (const c of chunks) {
          rows.push(
            await repo.createChunk({
              documentId: doc.id,
              clinicId,
              content: c.content,
              chunkIndex: c.chunkIndex,
              metadata: { source: 'document', ...(c.question ? { question: c.question } : {}) },
            }),
          )
        }
        return { document: doc, stored: rows }
      })

      // Each chunk is embedded asynchronously (same job shape the kb-embed worker expects).
      for (const chunk of stored) {
        await kbEmbedQueue.add('embed', { chunkId: chunk.id, clinicId, content: chunk.content })
      }

      return reply.code(201).send({ jobId: document.id, chunks: stored.length })
    },
  )
}

export default kbUploadRoute
