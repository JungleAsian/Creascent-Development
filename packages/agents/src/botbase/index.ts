export {
  isInsideBusinessHours,
  type BusinessHours,
  type DayHours,
} from './business-hours.js'

export { detectLanguage, type Language } from './language-detector.js'

export {
  searchKb,
  rankChunks,
  cosineSimilarity,
  type Embedder,
  type EmbeddedChunk,
  type KbMatch,
} from './kb-retriever.js'

export {
  runClinicBot,
  isEmergencyMessage,
  resolveLanguage,
  type BotTone,
  type BotLanguage,
  type ClinicBotConfig,
  type ClinicBotInput,
  type ClinicBotDeps,
  type ClinicBotResult,
  type BotErrorInfo,
} from './clinic-bot.js'
