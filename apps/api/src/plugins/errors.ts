import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  const status = error.statusCode ?? 500
  reply.code(status).send({
    ok: false,
    error: error.message,
    code: error.code ?? 'INTERNAL_ERROR',
  })
}

export function notFoundHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  reply.code(404).send({ ok: false, error: 'Not found', code: 'NOT_FOUND' })
}
