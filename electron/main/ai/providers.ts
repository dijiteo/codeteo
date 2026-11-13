import type { AIModel, AgentChatMessage, AgentToolCall, BuiltInProviderId, ChatMessage, ProviderId } from '../../../src/shared/ai'
import { randomUUID } from 'node:crypto'
import { readServerSentEvents } from './sse'

export type FetchLike = (
  url: string,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<Response>

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'done'; stopReason?: string }

export type AgentStreamEvent = StreamEvent | { type: 'tool-call'; call: AgentToolCall }

export interface ChatParams {
  apiKey: string
  model: string
  system: string
  messages: ChatMessage[]
  signal?: AbortSignal
}

export interface AIProvider {
  id: ProviderId
  name: string
  keyUrl: string
  listModels(apiKey: string, signal?: AbortSignal): Promise<AIModel[]>
  streamChat(params: ChatParams): AsyncGenerator<StreamEvent>
  streamAgent?(params: Omit<ChatParams, 'messages'> & { messages: AgentChatMessage[] }): AsyncGenerator<AgentStreamEvent>
}

export class ProviderError extends Error {}

const ANTHROPIC_MAX_OUTPUT_TOKENS = 8192

type Json = Record<string, any>

const agentFunctions = [
  {
    name: 'list_files',
    description: 'List files and folders in a workspace-relative directory. Use an empty path for the workspace root.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'read_file',
    description: 'Read a UTF-8 text file from the workspace using its workspace-relative path.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'write_file',
    description: 'Propose replacing the complete contents of an existing workspace text file. The user must approve the replacement before it is saved.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
  {
    name: 'run_command',
    description: 'Propose running one PowerShell command in the workspace. The user must approve the exact command before execution.',
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
  },
]

function parseArguments(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function parseArgumentText(value: string): Record<string, unknown> {
  try {
    return parseArguments(JSON.parse(value))
  } catch {
    return {}
  }
}

function anthropicAgentMessages(messages: AgentChatMessage[]): Json[] {
  const result: Json[] = []
  for (const message of messages) {
    if (message.role === 'system') continue
    if (message.role === 'assistant' && message.tool_calls?.length) {
      const content: Json[] = []
      if (message.content) content.push({ type: 'text', text: message.content })
      for (const call of message.tool_calls) {
        content.push({ type: 'tool_use', id: call.id, name: call.name, input: parseArgumentText(call.arguments) })
      }
      result.push({ role: 'assistant', content })
      continue
    }
    if (message.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: message.tool_call_id ?? '', content: message.content ?? '' }
      const previous = result.at(-1)
      if (previous?.role === 'user' && Array.isArray(previous.content)) previous.content.push(block)
      else result.push({ role: 'user', content: [block] })
      continue
    }
    result.push({ role: message.role, content: message.content ?? '' })
  }
  return result
}

function geminiAgentContents(messages: AgentChatMessage[]): Json[] {
  const names = new Map<string, string>()
  for (const message of messages) for (const call of message.tool_calls ?? []) names.set(call.id, call.name)
  const result: Json[] = []
  for (const message of messages) {
    if (message.role === 'system') continue
    if (message.role === 'tool') {
      const block = {
        functionResponse: {
          name: names.get(message.tool_call_id ?? '') ?? 'unknown_tool',
          ...(message.tool_call_id ? { id: message.tool_call_id } : {}),
          response: { result: message.content ?? '' },
        },
      }
      const previous = result.at(-1)
      if (previous?.role === 'user' && Array.isArray(previous.parts)) previous.parts.push(block)
      else result.push({ role: 'user', parts: [block] })
      continue
    }
    const parts: Json[] = []
    if (message.content) parts.push({ text: message.content })
    for (const call of message.tool_calls ?? []) {
      parts.push({ functionCall: { name: call.name, ...(call.id ? { id: call.id } : {}), args: parseArgumentText(call.arguments) } })
    }
    result.push({ role: message.role === 'assistant' ? 'model' : 'user', parts })
  }
  return result
}

function errorDetail(json: unknown): string | undefined {
  const value = Array.isArray(json) ? json[0] : json
  if (!value || typeof value !== 'object') return undefined
  const record = value as Json
  const message = record.error?.message ?? record.message ?? (typeof record.error === 'string' ? record.error : undefined)
  return typeof message === 'string' ? message : undefined
}

async function ensureOk(response: Response, providerName: string): Promise<void> {
  if (response.ok) return
  let detail = ''
  try {
    const text = await response.text()
    try {
      detail = errorDetail(JSON.parse(text)) ?? text
    } catch {
      detail = text
    }
  } catch {
    detail = ''
  }
  detail = detail.trim().slice(0, 400)
  const hint = response.status === 401 || response.status === 403
    ? ' Check the API key.'
    : response.status === 429 ? ' The rate limit or quota was reached.' : ''
  throw new ProviderError(`${providerName} returned HTTP ${response.status}${detail ? `: ${detail}` : ''}.${hint}`)
}

async function getJson(fetch: FetchLike, providerName: string, url: string, headers: Record<string, string>, signal?: AbortSignal): Promise<Json> {
  const response = await fetch(url, { method: 'GET', headers, signal })
  await ensureOk(response, providerName)
  return await response.json() as Json
}

async function postStream(fetch: FetchLike, providerName: string, url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...headers },
    body: JSON.stringify(body),
    signal,
  })
  await ensureOk(response, providerName)
  if (!response.body) throw new ProviderError(`${providerName} returned an empty response.`)
  return readServerSentEvents(response.body)
}

function parseChunk(providerName: string, data: string): Json {
  try {
    return JSON.parse(data) as Json
  } catch {
    throw new ProviderError(`${providerName} sent a response that could not be read.`)
  }
}

function byName(left: AIModel, right: AIModel): number {
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
}

export interface OpenAiCompatibleOptions {
  id: ProviderId
  name: string
  keyUrl: string
  baseUrl: string
  extraHeaders?: Record<string, string>
  supportsAgent?: boolean
  includeUsage?: boolean
  toModel(raw: Json): AIModel | null
}

export function createOpenAiCompatibleProvider(fetch: FetchLike, options: OpenAiCompatibleOptions): AIProvider {
  const headers = (apiKey: string) => ({ ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}), ...options.extraHeaders })
  const provider: AIProvider = {
    id: options.id,
    name: options.name,
    keyUrl: options.keyUrl,
    async listModels(apiKey, signal) {
      const json = await getJson(fetch, options.name, `${options.baseUrl}/models`, headers(apiKey), signal)
      const data: Json[] = Array.isArray(json.data) ? json.data : []
      return data.flatMap((raw) => options.toModel(raw) ?? []).sort(byName)
    },
    async *streamChat({ apiKey, model, system, messages, signal }) {
      const events = await postStream(fetch, options.name, `${options.baseUrl}/chat/completions`, headers(apiKey), {
        model,
        stream: true,
        ...(options.includeUsage === false ? {} : { stream_options: { include_usage: true } }),
        messages: [{ role: 'system', content: system }, ...messages],
      }, signal)
      let stopReason: string | undefined
      for await (const event of events) {
        if (event.data === '[DONE]') break
        const chunk = parseChunk(options.name, event.data)
        if (chunk.error) throw new ProviderError(`${options.name}: ${errorDetail(chunk) ?? 'the response stream failed.'}`)
        const choice = chunk.choices?.[0]
        const text = choice?.delta?.content
        if (typeof text === 'string' && text) yield { type: 'delta', text }
        if (typeof choice?.finish_reason === 'string') stopReason = choice.finish_reason
        if (chunk.usage) {
          yield { type: 'usage', inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens }
        }
      }
      yield { type: 'done', stopReason }
    },
    async *streamAgent({ apiKey, model, system, messages, signal }) {
      const events = await postStream(fetch, options.name, `${options.baseUrl}/chat/completions`, headers(apiKey), {
        model,
        stream: true,
        ...(options.includeUsage === false ? {} : { stream_options: { include_usage: true } }),
        tool_choice: 'auto',
        parallel_tool_calls: false,
        tools: agentFunctions.map((tool) => ({ type: 'function', function: tool })),
        messages: [{ role: 'system', content: system }, ...messages],
      }, signal)
      const calls = new Map<number, AgentToolCall>()
      for await (const event of events) {
        if (event.data === '[DONE]') break
        const chunk = parseChunk(options.name, event.data)
        if (chunk.error) throw new ProviderError(`${options.name}: ${errorDetail(chunk) ?? 'the response stream failed.'}`)
        const choice = chunk.choices?.[0]
        const text = choice?.delta?.content
        if (typeof text === 'string' && text) yield { type: 'delta', text }
        for (const fragment of choice?.delta?.tool_calls ?? []) {
          const index = Number(fragment.index)
          if (!Number.isInteger(index) || index < 0) continue
          const call = calls.get(index) ?? { id: '', name: '', arguments: '' }
          if (typeof fragment.id === 'string') call.id += fragment.id
          if (typeof fragment.function?.name === 'string') call.name += fragment.function.name
          if (typeof fragment.function?.arguments === 'string') call.arguments += fragment.function.arguments
          calls.set(index, call)
        }
        if (chunk.usage) yield { type: 'usage', inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens }
      }
      for (const call of calls.values()) yield { type: 'tool-call', call }
      yield { type: 'done' }
    },
  }
  if (!options.supportsAgent) delete provider.streamAgent
  return provider
}

const openAiChatModel = /^(gpt-|chatgpt-|o\d)/
const openAiNonChatModel = /(audio|realtime|transcribe|tts|image|embedding|search|moderation|instruct)/

function anthropic(fetch: FetchLike): AIProvider {
  const name = 'Anthropic Claude'
  const headers = (apiKey: string) => ({ 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' })
  return {
    id: 'anthropic',
    name,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    async listModels(apiKey, signal) {
      const json = await getJson(fetch, name, 'https://api.anthropic.com/v1/models?limit=1000', headers(apiKey), signal)
      const data: Json[] = Array.isArray(json.data) ? json.data : []
      return data.flatMap((raw) => typeof raw.id === 'string'
        ? [{ id: raw.id, name: typeof raw.display_name === 'string' ? raw.display_name : raw.id }]
        : [])
    },
    async *streamChat({ apiKey, model, system, messages, signal }) {
      const events = await postStream(fetch, name, 'https://api.anthropic.com/v1/messages', headers(apiKey), {
        model,
        max_tokens: ANTHROPIC_MAX_OUTPUT_TOKENS,
        system,
        messages,
        stream: true,
      }, signal)
      let inputTokens: number | undefined
      let outputTokens: number | undefined
      let stopReason: string | undefined
      for await (const event of events) {
        const chunk = parseChunk(name, event.data)
        if (chunk.type === 'error') throw new ProviderError(`${name}: ${errorDetail(chunk) ?? 'the response stream failed.'}`)
        if (chunk.type === 'message_start') inputTokens = chunk.message?.usage?.input_tokens
        if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta' && chunk.delta.text) {
          yield { type: 'delta', text: chunk.delta.text }
        }
        if (chunk.type === 'message_delta') {
          stopReason = chunk.delta?.stop_reason ?? stopReason
          outputTokens = chunk.usage?.output_tokens ?? outputTokens
        }
        if (chunk.type === 'message_stop') break
      }
      if (inputTokens !== undefined || outputTokens !== undefined) yield { type: 'usage', inputTokens, outputTokens }
      yield { type: 'done', stopReason }
    },
    async *streamAgent({ apiKey, model, system, messages, signal }) {
      const events = await postStream(fetch, name, 'https://api.anthropic.com/v1/messages', headers(apiKey), {
        model,
        max_tokens: ANTHROPIC_MAX_OUTPUT_TOKENS,
        system,
        messages: anthropicAgentMessages(messages),
        tools: agentFunctions.map(({ name: toolName, description, parameters }) => ({ name: toolName, description, input_schema: parameters })),
        stream: true,
      }, signal)
      const calls = new Map<number, AgentToolCall>()
      let inputTokens: number | undefined
      let outputTokens: number | undefined
      for await (const event of events) {
        const chunk = parseChunk(name, event.data)
        if (chunk.type === 'error') throw new ProviderError(`${name}: ${errorDetail(chunk) ?? 'the response stream failed.'}`)
        if (chunk.type === 'message_start') inputTokens = chunk.message?.usage?.input_tokens
        if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
          calls.set(Number(chunk.index), { id: String(chunk.content_block.id ?? ''), name: String(chunk.content_block.name ?? ''), arguments: '' })
        }
        if (chunk.type === 'content_block_delta') {
          if (chunk.delta?.type === 'text_delta' && typeof chunk.delta.text === 'string') yield { type: 'delta', text: chunk.delta.text }
          if (chunk.delta?.type === 'input_json_delta' && typeof chunk.delta.partial_json === 'string') {
            const call = calls.get(Number(chunk.index))
            if (call) call.arguments += chunk.delta.partial_json
          }
        }
        if (chunk.type === 'message_delta') outputTokens = chunk.usage?.output_tokens ?? outputTokens
        if (chunk.type === 'message_stop') break
      }
      if (inputTokens !== undefined || outputTokens !== undefined) yield { type: 'usage', inputTokens, outputTokens }
      for (const call of calls.values()) yield { type: 'tool-call', call: { ...call, arguments: call.arguments || '{}' } }
      yield { type: 'done' }
    },
  }
}

function gemini(fetch: FetchLike): AIProvider {
  const name = 'Google Gemini'
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
  const headers = (apiKey: string) => ({ 'x-goog-api-key': apiKey })
  return {
    id: 'gemini',
    name,
    keyUrl: 'https://aistudio.google.com/apikey',
    async listModels(apiKey, signal) {
      const json = await getJson(fetch, name, `${baseUrl}/models?pageSize=1000`, headers(apiKey), signal)
      const models: Json[] = Array.isArray(json.models) ? json.models : []
      return models
        .filter((raw) => typeof raw.name === 'string' && Array.isArray(raw.supportedGenerationMethods) && raw.supportedGenerationMethods.includes('generateContent'))
        .filter((raw) => !/gemini-2\.5-flash-lite/i.test(String(raw.name)))
        .map((raw) => ({
          id: String(raw.name).replace(/^models\//, ''),
          name: typeof raw.displayName === 'string' ? raw.displayName : String(raw.name),
          contextLength: typeof raw.inputTokenLimit === 'number' ? raw.inputTokenLimit : undefined,
        }))
        .sort(byName)
    },
    async *streamChat({ apiKey, model, system, messages, signal }) {
      const url = `${baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`
      const events = await postStream(fetch, name, url, headers(apiKey), {
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
      }, signal)
      let usage: Json | undefined
      let stopReason: string | undefined
      for await (const event of events) {
        const chunk = parseChunk(name, event.data)
        if (chunk.error) throw new ProviderError(`${name}: ${errorDetail(chunk) ?? 'the response stream failed.'}`)
        const candidate = chunk.candidates?.[0]
        const parts: Json[] = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
        const text = parts.filter((part) => !part.thought && typeof part.text === 'string').map((part) => part.text).join('')
        if (text) yield { type: 'delta', text }
        if (typeof candidate?.finishReason === 'string') stopReason = candidate.finishReason
        if (chunk.usageMetadata) usage = chunk.usageMetadata
      }
      if (usage) yield { type: 'usage', inputTokens: usage.promptTokenCount, outputTokens: usage.candidatesTokenCount }
      yield { type: 'done', stopReason }
    },
    async *streamAgent({ apiKey, model, system, messages, signal }) {
      const url = `${baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`
      const events = await postStream(fetch, name, url, headers(apiKey), {
        systemInstruction: { parts: [{ text: system }] },
        contents: geminiAgentContents(messages),
        tools: [{ functionDeclarations: agentFunctions }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      }, signal)
      const calls = new Map<number, AgentToolCall>()
      let usage: Json | undefined
      for await (const event of events) {
        const chunk = parseChunk(name, event.data)
        if (chunk.error) throw new ProviderError(`${name}: ${errorDetail(chunk) ?? 'the response stream failed.'}`)
        const candidate = chunk.candidates?.[0]
        const parts: Json[] = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
        for (const [partIndex, part] of parts.entries()) {
          if (!part.thought && typeof part.text === 'string' && part.text) yield { type: 'delta', text: part.text }
          const functionCall = part.functionCall
          if (!functionCall || typeof functionCall.name !== 'string') continue
          const existing = calls.get(partIndex)
          const args = parseArguments(functionCall.args)
          if (existing) {
            const merged = { ...parseArgumentText(existing.arguments), ...args }
            existing.arguments = JSON.stringify(merged)
          } else {
            calls.set(partIndex, {
              id: typeof functionCall.id === 'string' && functionCall.id ? functionCall.id : randomUUID(),
              name: functionCall.name,
              arguments: JSON.stringify(args),
            })
          }
        }
        if (chunk.usageMetadata) usage = chunk.usageMetadata
      }
      if (usage) yield { type: 'usage', inputTokens: usage.promptTokenCount, outputTokens: usage.candidatesTokenCount }
      for (const call of calls.values()) yield { type: 'tool-call', call }
      yield { type: 'done' }
    },
  }
}

export function createProviders(fetch: FetchLike): Record<BuiltInProviderId, AIProvider> {
  return {
    openai: createOpenAiCompatibleProvider(fetch, {
      id: 'openai',
      name: 'OpenAI',
      keyUrl: 'https://platform.openai.com/api-keys',
      baseUrl: 'https://api.openai.com/v1',
      supportsAgent: true,
      toModel: (raw) => typeof raw.id === 'string' && openAiChatModel.test(raw.id) && !openAiNonChatModel.test(raw.id)
        ? { id: raw.id, name: raw.id }
        : null,
    }),
    anthropic: anthropic(fetch),
    gemini: gemini(fetch),
    openrouter: createOpenAiCompatibleProvider(fetch, {
      id: 'openrouter',
      name: 'OpenRouter',
      keyUrl: 'https://openrouter.ai/settings/keys',
      baseUrl: 'https://openrouter.ai/api/v1',
      supportsAgent: true,
      extraHeaders: { 'x-title': 'CodeTeo' },
      toModel: (raw) => {
        if (typeof raw.id !== 'string') return null
        const outputs = raw.architecture?.output_modalities
        if (Array.isArray(outputs) && !outputs.includes('text')) return null
        return {
          id: raw.id,
          name: typeof raw.name === 'string' ? raw.name : raw.id,
          contextLength: typeof raw.context_length === 'number' ? raw.context_length : undefined,
        }
      },
    }),
    kumru: createOpenAiCompatibleProvider(fetch, {
      id: 'kumru',
      name: 'Kumru local server',
      keyUrl: 'https://huggingface.co/vngrs-ai/Kumru-2B',
      baseUrl: 'http://127.0.0.1:8000/v1',
      includeUsage: false,
      toModel: (raw) => typeof raw.id === 'string' ? { id: raw.id, name: raw.id } : null,
    }),
  }
}
