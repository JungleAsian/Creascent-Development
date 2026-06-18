'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'

type Props = {
  children: ReactNode
  language: 'en' | 'es'
}

const exactTranslations: Record<string, string> = {
  'A local build workbench for prompts, gates, diagnostics, agents, cost, deployment, and Discord routing.': 'Un panel local para prompts, controles, diagnosticos, agentes, costos, despliegue y rutas de Discord.',
  'Add Backlog Task': 'Agregar tarea pendiente',
  'Add task': 'Agregar tarea',
  'All gates passed': 'Todos los controles pasaron',
  'All ready prompts are cached and usable.': 'Todos los prompts listos estan guardados y se pueden usar.',
  'Automated build watcher started': 'Monitor de compilacion automatica iniciado',
  'Backend builder': 'Constructor backend',
  'Build Control': 'Control de compilacion',
  'Build Progress': 'Progreso de compilacion',
  'Build output is written to /tools/logs/phase-YYYY-MM-DD.log.': 'La salida de compilacion se escribe en /tools/logs/phase-YYYY-MM-DD.log.',
  'Build progress': 'Progreso de compilacion',
  'Build stopped': 'Compilacion detenida',
  'Check Build Running': 'Comprobar si la compilacion esta activa',
  'Claude Code build started': 'Compilacion con Claude Code iniciada',
  'Claude Code is working': 'Claude Code esta trabajando',
  'Claude Pro': 'Claude Pro',
  'Configuration': 'Configuracion',
  'Connected': 'Conectado',
  'Current phase': 'Fase actual',
  'Current step': 'Paso actual',
  'Current workspace': 'Espacio de trabajo actual',
  'Dashboard package found.': 'Paquete del panel encontrado.',
  'Deploy command completed': 'Comando de despliegue completado',
  'Deploy to VPS': 'Desplegar al VPS',
  'DevTools is ready': 'DevTools esta listo',
  'Diagnostics': 'Diagnosticos',
  'Discord messaging is configured.': 'La mensajeria de Discord esta configurada.',
  'Dry Run': 'Prueba en seco',
  'Dry run passed. Start can launch without hidden setup work.': 'La prueba en seco paso. El inicio puede ejecutarse sin preparacion oculta.',
  'Failed': 'Fallo',
  'Failures': 'Fallos',
  'Full automation for all 19 phases through Claude Code.': 'Automatizacion completa de las 19 fases mediante Claude Code.',
  'GitHub remote is reachable.': 'El remoto de GitHub esta disponible.',
  'Heartbeat': 'Latido',
  'How to continue': 'Como continuar',
  'Install Monitor': 'Monitor de instalacion',
  'Launch Application': 'Abrir aplicacion',
  'Launch application for checking': 'Abrir aplicacion para revisar',
  'Final deployment to VPS': 'Despliegue final al VPS',
  'Live build process': 'Proceso de compilacion activo',
  'Mark Done': 'Marcar listo',
  'Needs attention': 'Requiere atencion',
  'Next Best Action': 'Siguiente mejor accion',
  'No active build watcher': 'No hay monitor de compilacion activo',
  'No current note.': 'No hay nota actual.',
  'No live process detected': 'No se detecto proceso activo',
  'No phase': 'Sin fase',
  'No recent activity.': 'Sin actividad reciente.',
  'No placeholder ready prompts detected.': 'No se detectaron prompts listos de marcador de posicion.',
  'Not checked': 'No comprobado',
  'Not passed': 'No aprobado',
  'Not running': 'No esta activo',
  'Open Build Control': 'Abrir Control de compilacion',
  'Open Notion spec': 'Abrir especificacion en Notion',
  'Open Ready Check': 'Abrir comprobacion de preparacion',
  'Open Ready Details': 'Abrir detalles de preparacion',
  'Open in Notion': 'Abrir en Notion',
  'Operations console': 'Consola de operaciones',
  'Passed': 'Aprobado',
  'Paused until Claude refresh': 'Pausado hasta actualizar Claude',
  'Phase Progress': 'Progreso de fases',
  'Phase Timeline': 'Linea de tiempo de fases',
  'Phase build command completed': 'Comando de compilacion de fase completado',
  'Phases complete': 'Fases completadas',
  'Polling check': 'Comprobacion de sondeo',
  'Post-Deployment Log': 'Registro post-despliegue',
  'Issues found after development and before VPS deployment.': 'Problemas encontrados despues del desarrollo y antes del despliegue al VPS.',
  'Prepare Context': 'Preparar contexto',
  'Prompt Sync Status': 'Estado de sincronizacion de prompts',
  'Ready Check': 'Comprobacion de preparacion',
  'Ready Check passed. Claude Pro, Notion, GitHub, prompts, and Discord are usable.': 'La comprobacion de preparacion paso. Claude Pro, Notion, GitHub, los prompts y Discord estan listos para usarse.',
  'Ready checks': 'Comprobaciones de preparacion',
  'Reachable': 'Disponible',
  'Recent Activity': 'Actividad reciente',
  'Re-run Gates': 'Ejecutar controles otra vez',
  'Resume from': 'Reanudar desde',
  'Review Settings': 'Revisar configuracion',
  'Run Start Check': 'Ejecutar comprobacion de inicio',
  'Run Functionality Check': 'Ejecutar comprobacion de funcionalidades',
  'Run before build': 'Ejecutar antes de compilar',
  'Running': 'Activo',
  'Safe Build Test': 'Prueba segura de compilacion',
  'Safe Start Check passed for': 'Comprobacion segura de inicio aprobada para',
  'Setup Check': 'Comprobacion de configuracion',
  'Stack intelligence': 'Inteligencia del stack',
  'Start Automated Build': 'Iniciar compilacion automatica',
  'Start': 'Iniciar',
  'Start Build Control': 'Iniciar Control de compilacion',
  'Start Check': 'Comprobacion de inicio',
  'Start Readiness needs a check': 'La preparacion de inicio necesita comprobacion',
  'Start Readiness passed': 'Preparacion de inicio aprobada',
  'Stop Build': 'Detener compilacion',
  'Stopped': 'Detenido',
  'Supporting Tools': 'Herramientas de soporte',
  'Sync from Notion': 'Sincronizar desde Notion',
  'Typecheck passed.': 'La comprobacion de tipos paso.',
  'Updated': 'Actualizado',
  'Latest Functionality Check': 'Ultima comprobacion de funcionalidades',
  'Current Issues': 'Problemas actuales',
  'No current issues from the latest check.': 'No hay problemas actuales en la ultima comprobacion.',
  'Run the check to create the first log.': 'Ejecuta la comprobacion para crear el primer registro.',
  'No post-deployment checks have been recorded yet.': 'Todavia no se han registrado comprobaciones post-despliegue.',
  'No history yet.': 'Todavia no hay historial.',
  'Functionality': 'Funcionalidad',
  'Result': 'Resultado',
  'Last run': 'Ultima ejecucion',
  'Waiting': 'En espera',
  'Waiting for heartbeat': 'Esperando latido',
  'Warnings': 'Advertencias',
  'Available after all 19 build phases are complete.': 'Disponible cuando las 19 fases de compilacion esten completas.',
  'Requests the VPS deployment plan and posts a critical Discord confirmation.': 'Solicita el plan de despliegue al VPS y publica una confirmacion critica en Discord.',
  'Starts the local app, opens the Inbox UI, and uses the demo login.': 'Inicia la aplicacion local, abre Inbox UI y usa el acceso demo.',
  'Target: VPS/domain from Settings': 'Destino: VPS/dominio desde Configuracion',
  'Type: production deployment request': 'Tipo: solicitud de despliegue de produccion',
  'Open Deploy page': 'Abrir pagina de despliegue',
  'Open Post-Deployment Log': 'Abrir registro post-despliegue',
  'Run Runtime Check': 'Ejecutar comprobacion de runtime',
  'Local Deployment Runtime': 'Runtime de despliegue local',
  'These dependencies are required after the build and before VPS deployment.': 'Estas dependencias son necesarias despues de la compilacion y antes del despliegue al VPS.',
  'Docker engine': 'Motor Docker',
  'Postgres port': 'Puerto Postgres',
  'Redis port': 'Puerto Redis',
  'API health': 'Estado de API',
  'Demo login': 'Acceso demo',
  'Runs local Postgres and Redis containers.': 'Ejecuta contenedores locales de Postgres y Redis.',
  'Database required for login and app data.': 'Base de datos requerida para acceso y datos de la aplicacion.',
  'Queue/cache runtime used by background jobs.': 'Runtime de cola/cache usado por trabajos en segundo plano.',
  'Confirms the local API can respond.': 'Confirma que la API local responde.',
  'Confirms seeded test credentials work.': 'Confirma que las credenciales demo funcionan.',
  'build progress': 'progreso de compilacion',
  'commit': 'commit',
  'critical issues': 'problemas criticos',
  'not prepared': 'no preparado',
  'not synced': 'no sincronizado',
  'not updated': 'sin actualizar',
  'not yet': 'todavia no',
  'done': 'listo',
  'in-progress': 'en progreso',
  'not-started': 'no iniciado',
  'pending': 'pendiente',
  'ready': 'listo',
  'updated': 'actualizado',
  'warnings': 'advertencias'
}

const wordTranslations: Record<string, string> = {
  Agents: 'Agentes',
  Backlog: 'Pendientes',
  Check: 'Comprobar',
  Complete: 'Completo',
  Completed: 'Completado',
  Configuration: 'Configuracion',
  Diagnostics: 'Diagnosticos',
  English: 'Ingles',
  Gates: 'Controles',
  Halted: 'Detenido',
  Logs: 'Registros',
  More: 'Mas',
  Overview: 'Resumen',
  Pending: 'Pendiente',
  Progressing: 'Avanzando',
  Ready: 'Listo',
  Settings: 'Configuracion',
  Stopped: 'Detenido',
  Unknown: 'Desconocido'
}

const originals = new WeakMap<Text, string>()

function translateText(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return value

  const exact = exactTranslations[trimmed]
  if (exact) return value.replace(trimmed, exact)

  const resumeMatch = trimmed.match(/^Resume from (P\d{2})$/)
  if (resumeMatch) return value.replace(trimmed, `Reanudar desde ${resumeMatch[1]}`)

  const completeMatch = trimmed.match(/^(\d+)\/(\d+) phases complete$/)
  if (completeMatch) return value.replace(trimmed, `${completeMatch[1]}/${completeMatch[2]} fases completadas`)

  const charsMatch = trimmed.match(/^(\d+) chars$/)
  if (charsMatch) return value.replace(trimmed, `${charsMatch[1]} caracteres`)

  const businessMatch = trimmed.match(/^Business phase (\d+) · (.+)$/)
  if (businessMatch) {
    return value.replace(trimmed, `Fase de negocio ${businessMatch[1]} · ${businessMatch[2].replaceAll(' chars', ' caracteres').replaceAll('prompt', 'prompt').replaceAll('synced', 'sincronizado')}`)
  }

  const workingMatch = trimmed.match(/^(P\d{2}) Claude Code is working$/)
  if (workingMatch) return value.replace(trimmed, `${workingMatch[1]} Claude Code esta trabajando`)

  const startingMatch = trimmed.match(/^(P\d{2}) Claude Code build starting$/)
  if (startingMatch) return value.replace(trimmed, `Compilacion de ${startingMatch[1]} con Claude Code iniciando`)

  const word = wordTranslations[trimmed]
  return word ? value.replace(trimmed, word) : value
}

function shouldSkip(node: Node) {
  const parent = node.parentElement
  if (!parent) return true
  return Boolean(parent.closest('script, style, code, pre, textarea, input, select, option, [data-no-translate]'))
}

function translate(root: HTMLElement, language: 'en' | 'es') {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)

  for (const node of nodes) {
    if (shouldSkip(node)) continue
    const current = node.nodeValue ?? ''
    let original = originals.get(node)
    if (!original) {
      original = current
      originals.set(node, original)
    } else if (current !== original && current !== translateText(original)) {
      original = current
      originals.set(node, original)
    }
    node.nodeValue = language === 'es' ? translateText(original) : original
  }
}

export function SpanishTranslator({ children, language }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    let applying = false
    const apply = () => {
      if (applying) return
      applying = true
      translate(root, language)
      applying = false
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [language])

  return <div ref={ref}>{children}</div>
}
