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
  emergencyNotice,
  resolveLanguage,
  type BotTone,
  type BotLanguage,
  type ClinicBotConfig,
  type ClinicBotInput,
  type ClinicBotDeps,
  type ClinicBotResult,
  type BotErrorInfo,
} from './clinic-bot.js'

export {
  trainDocument,
  extractText,
  parseFaqPairs,
  looksLikeFaq,
  chunkText,
  detectFormat,
  type DocumentFormat,
  type TrainedChunk,
  type TrainDocumentInput,
  type QAPair,
} from './document-trainer.js'

export {
  matchCustomFlow,
  type CustomFlowDef,
  type CustomFlowAction,
  type CustomFlowLanguage,
} from './custom-flows.js'
