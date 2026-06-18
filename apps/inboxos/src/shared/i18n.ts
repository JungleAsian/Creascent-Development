// Gap #21 / Gap #15 — Panel i18n. Full ES/EN dictionaries plus a tiny `t()`
// helper with {var} interpolation. Spanish is the default (Decision: clinics are
// LATAM-first); English is a per-user toggle persisted via POST /user/preferences.
import type { PanelLanguage } from './types'

export const LANGUAGES: PanelLanguage[] = ['es', 'en']
export const DEFAULT_LANGUAGE: PanelLanguage = 'es'

type Dict = Record<string, string>

const es: Dict = {
  'app.name': 'Docmee InboxOS',

  'common.loading': 'Cargando…',
  'common.save': 'Guardar',
  'common.cancel': 'Cancelar',
  'common.delete': 'Eliminar',
  'common.edit': 'Editar',
  'common.add': 'Agregar',
  'common.close': 'Cerrar',
  'common.none': 'Ninguno',
  'common.retry': 'Reintentar',
  'common.error': 'Ocurrió un error',
  'common.empty': 'Sin resultados',
  'common.confirm': '¿Estás seguro?',

  'nav.inbox': 'Bandeja',
  'nav.studio': 'IA Studio',
  'nav.logout': 'Cerrar sesión',
  'nav.clinics': 'Clínicas',
  'nav.kb': 'Base de conocimiento',
  'nav.errors': 'Revisión de errores',
  'nav.usage': 'Uso',
  'nav.backToInbox': 'Volver a la bandeja',

  'lang.toggle': 'Idioma',
  'lang.es': 'Español',
  'lang.en': 'Inglés',

  'login.title': 'Iniciar sesión',
  'login.subtitle': 'Panel de la clínica',
  'login.email': 'Correo electrónico',
  'login.password': 'Contraseña',
  'login.submit': 'Entrar',
  'login.loading': 'Entrando…',
  'login.error': 'Correo o contraseña inválidos',

  'conv.title': 'Conversaciones',
  'conv.empty': 'No hay conversaciones',
  'conv.unassigned': 'Sin asignar',
  'conv.assignedToMe': 'Asignada a mí',
  'conv.status.open': 'Abierta',
  'conv.status.assigned': 'Asignada',
  'conv.status.resolved': 'Resuelta',
  'conv.status.handoff': 'Atención humana',
  'conv.filter.all': 'Todas',
  'conv.filter.mine': 'Mías',

  'view.empty': 'Selecciona una conversación',
  'view.placeholder': 'Escribe un mensaje…',
  'view.send': 'Enviar',
  'view.sending': 'Enviando…',
  'view.close': 'Resolver',
  'view.reopen': 'Reabrir',
  'view.closedNotice': 'Esta conversación está resuelta. Reabrir crea una nueva conversación.',
  'view.noMessages': 'Aún no hay mensajes',
  'view.mode.title': 'Modo',
  'view.mode.bot': 'Bot IA',
  'view.mode.human': 'Secretaria',
  'view.mode.botHint': 'El bot responde automáticamente',
  'view.mode.humanHint': 'Un agente humano está atendiendo',
  'view.role.user': 'Paciente',
  'view.role.agent': 'Agente',
  'view.role.assistant': 'Bot',
  'view.role.system': 'Sistema',

  'tags.title': 'Etiquetas',
  'tags.placeholder': 'Nueva etiqueta…',
  'tags.empty': 'Sin etiquetas',
  'tags.add': 'Agregar etiqueta',

  'notes.title': 'Notas internas',
  'notes.placeholder': 'Escribe una nota interna…',
  'notes.empty': 'Sin notas',
  'notes.add': 'Agregar nota',
  'notes.warning': '⚠️ Las notas internas nunca se envían al paciente',

  'assign.title': 'Asignación',
  'assign.current': 'Asignada a',
  'assign.toMe': 'Asignarme a mí',
  'assign.unassign': 'Quitar asignación',
  'assign.member': 'Asignar a miembro',
  'assign.choose': 'Selecciona un miembro…',

  'studio.title': 'IA Studio',
  'studio.subtitle': 'Consola de administración',

  'studio.clinics.title': 'Gestión de clínicas',
  'studio.clinics.name': 'Nombre',
  'studio.clinics.slug': 'Identificador',
  'studio.clinics.plan': 'Plan',
  'studio.clinics.status': 'Estado',
  'studio.clinics.timezone': 'Zona horaria',
  'studio.clinics.new': 'Nueva clínica',
  'studio.clinics.create': 'Crear clínica',
  'studio.clinics.empty': 'No hay clínicas',
  'studio.clinics.saved': 'Cambios guardados',

  'studio.kb.title': 'Base de conocimiento',
  'studio.kb.selectClinic': 'Selecciona una clínica',
  'studio.kb.docTitle': 'Título',
  'studio.kb.content': 'Contenido',
  'studio.kb.type': 'Tipo',
  'studio.kb.status': 'Estado',
  'studio.kb.add': 'Agregar documento',
  'studio.kb.reembed': 'Re-indexar todo',
  'studio.kb.reembedQueued': 'Re-indexación encolada',
  'studio.kb.empty': 'No hay documentos',
  'studio.kb.deleteConfirm': '¿Eliminar este documento?',

  'studio.errors.title': 'Revisión de errores',
  'studio.errors.selectClinic': 'Selecciona una clínica',
  'studio.errors.type': 'Tipo',
  'studio.errors.message': 'Mensaje',
  'studio.errors.when': 'Fecha',
  'studio.errors.resolve': 'Resolver',
  'studio.errors.empty': 'No hay errores abiertos',
  'studio.errors.showResolved': 'Mostrar resueltos',

  'studio.usage.title': 'Uso',
  'studio.usage.activeConversations': 'Conversaciones activas',
  'studio.usage.totalPatients': 'Pacientes totales',
  'studio.usage.activeClinics': 'Clínicas activas',
  'studio.usage.selectClinic': 'Clínica',
}

const en: Dict = {
  'app.name': 'Docmee InboxOS',

  'common.loading': 'Loading…',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.close': 'Close',
  'common.none': 'None',
  'common.retry': 'Retry',
  'common.error': 'Something went wrong',
  'common.empty': 'No results',
  'common.confirm': 'Are you sure?',

  'nav.inbox': 'Inbox',
  'nav.studio': 'IA Studio',
  'nav.logout': 'Log out',
  'nav.clinics': 'Clinics',
  'nav.kb': 'Knowledge base',
  'nav.errors': 'Error review',
  'nav.usage': 'Usage',
  'nav.backToInbox': 'Back to inbox',

  'lang.toggle': 'Language',
  'lang.es': 'Spanish',
  'lang.en': 'English',

  'login.title': 'Sign in',
  'login.subtitle': 'Clinic panel',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.loading': 'Signing in…',
  'login.error': 'Invalid email or password',

  'conv.title': 'Conversations',
  'conv.empty': 'No conversations',
  'conv.unassigned': 'Unassigned',
  'conv.assignedToMe': 'Assigned to me',
  'conv.status.open': 'Open',
  'conv.status.assigned': 'Assigned',
  'conv.status.resolved': 'Resolved',
  'conv.status.handoff': 'Human handoff',
  'conv.filter.all': 'All',
  'conv.filter.mine': 'Mine',

  'view.empty': 'Select a conversation',
  'view.placeholder': 'Type a message…',
  'view.send': 'Send',
  'view.sending': 'Sending…',
  'view.close': 'Resolve',
  'view.reopen': 'Reopen',
  'view.closedNotice': 'This conversation is resolved. Reopening creates a new conversation.',
  'view.noMessages': 'No messages yet',
  'view.mode.title': 'Mode',
  'view.mode.bot': 'AI Bot',
  'view.mode.human': 'Secretary',
  'view.mode.botHint': 'The bot replies automatically',
  'view.mode.humanHint': 'A human agent is handling this',
  'view.role.user': 'Patient',
  'view.role.agent': 'Agent',
  'view.role.assistant': 'Bot',
  'view.role.system': 'System',

  'tags.title': 'Tags',
  'tags.placeholder': 'New tag…',
  'tags.empty': 'No tags',
  'tags.add': 'Add tag',

  'notes.title': 'Internal notes',
  'notes.placeholder': 'Write an internal note…',
  'notes.empty': 'No notes',
  'notes.add': 'Add note',
  'notes.warning': '⚠️ Internal notes are never sent to the patient',

  'assign.title': 'Assignment',
  'assign.current': 'Assigned to',
  'assign.toMe': 'Assign to me',
  'assign.unassign': 'Unassign',
  'assign.member': 'Assign to member',
  'assign.choose': 'Choose a member…',

  'studio.title': 'IA Studio',
  'studio.subtitle': 'Admin console',

  'studio.clinics.title': 'Clinic management',
  'studio.clinics.name': 'Name',
  'studio.clinics.slug': 'Slug',
  'studio.clinics.plan': 'Plan',
  'studio.clinics.status': 'Status',
  'studio.clinics.timezone': 'Timezone',
  'studio.clinics.new': 'New clinic',
  'studio.clinics.create': 'Create clinic',
  'studio.clinics.empty': 'No clinics',
  'studio.clinics.saved': 'Changes saved',

  'studio.kb.title': 'Knowledge base',
  'studio.kb.selectClinic': 'Select a clinic',
  'studio.kb.docTitle': 'Title',
  'studio.kb.content': 'Content',
  'studio.kb.type': 'Type',
  'studio.kb.status': 'Status',
  'studio.kb.add': 'Add document',
  'studio.kb.reembed': 'Re-index all',
  'studio.kb.reembedQueued': 'Re-index queued',
  'studio.kb.empty': 'No documents',
  'studio.kb.deleteConfirm': 'Delete this document?',

  'studio.errors.title': 'Error review',
  'studio.errors.selectClinic': 'Select a clinic',
  'studio.errors.type': 'Type',
  'studio.errors.message': 'Message',
  'studio.errors.when': 'When',
  'studio.errors.resolve': 'Resolve',
  'studio.errors.empty': 'No open errors',
  'studio.errors.showResolved': 'Show resolved',

  'studio.usage.title': 'Usage',
  'studio.usage.activeConversations': 'Active conversations',
  'studio.usage.totalPatients': 'Total patients',
  'studio.usage.activeClinics': 'Active clinics',
  'studio.usage.selectClinic': 'Clinic',
}

const DICTS: Record<PanelLanguage, Dict> = { es, en }

export type TranslationKey = keyof typeof es

/** Translate `key` for `lang`, interpolating `{var}` placeholders from `vars`. */
export function translate(
  lang: PanelLanguage,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const dict = DICTS[lang] ?? DICTS[DEFAULT_LANGUAGE]
  let out = dict[key] ?? DICTS[DEFAULT_LANGUAGE][key] ?? (key as string)
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value))
    }
  }
  return out
}
