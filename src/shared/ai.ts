export type BuiltInProviderId = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'kumru'
export type CustomProviderId = `custom-${string}`
export type ProviderId = BuiltInProviderId | CustomProviderId

export const providerIds: readonly BuiltInProviderId[] = ['openai', 'anthropic', 'gemini', 'openrouter', 'kumru']

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && ((providerIds as readonly string[]).includes(value) || /^custom-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
}

export function isBuiltInProviderId(value: unknown): value is BuiltInProviderId {
  return typeof value === 'string' && (providerIds as readonly string[]).includes(value)
}

export interface ProviderStatus {
  id: ProviderId
  name: string
  configured: boolean
  supportsAgent: boolean
  kind: 'api-key' | 'local-server' | 'openai-compatible'
  endpoint?: string
}

export interface CompatibleProviderInput {
  name: string
  baseUrl: string
  apiKey?: string
  supportsAgent: boolean
}

export interface AIModel {
  id: string
  name: string
  contextLength?: number
}

export interface ModelSelection {
  providerId: ProviderId
  modelId: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatContextFile {
  path: string
  content: string
}

export interface ChatRequest extends ModelSelection {
  messages: ChatMessage[]
  contextFile?: ChatContextFile
  agentMode?: boolean
}

export interface AgentToolCall {
  id: string
  name: string
  arguments: string
}

export interface AgentChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: AgentToolCall[]
  tool_call_id?: string
}

export type ChatEvent =
  | { chatId: string; type: 'delta'; text: string }
  | { chatId: string; type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { chatId: string; type: 'done'; stopReason?: string }
  | { chatId: string; type: 'error'; message: string }
  | {
      chatId: string
      type: 'approval-request'
      callId: string
      workspace: string
      action:
        | { kind: 'write-file'; path: string; before: string; after: string }
        | { kind: 'run-command'; command: string }
    }
  | { chatId: string; type: 'file-changed'; path: string; content: string }
