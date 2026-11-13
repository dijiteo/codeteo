import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ChatEvent } from '../../../src/shared/ai'
import { CredentialStore, type Encryptor } from './credentials'
import { createProviders, type FetchLike } from './providers'
import { AiService, buildSystemPrompt, validateChatRequest } from './service'
import { readServerSentEvents } from './sse'

const encoder = new TextEncoder()

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

function sseResponse(chunks: string[]): Response {
  return new Response(streamOf(chunks), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

interface Call { url: string; init: Parameters<FetchLike>[1] }

function fakeFetch(respond: (call: Call) => Response): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    fetch: async (url, init) => {
      const call = { url, init }
      calls.push(call)
      return respond(call)
    },
  }
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of iterable) items.push(item)
  return items
}

const fakeEncryptor: Encryptor = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(`enc:${[...text].reverse().join('')}`),
  decryptString: (data) => [...data.toString().slice(4)].reverse().join(''),
}

const params = { apiKey: 'sk-test-123456', model: 'model-1', system: 'Be helpful.', messages: [{ role: 'user' as const, content: 'Hi' }] }

describe('server-sent events', () => {
  it('handles events split across chunks, CRLF line endings, comments, and multi-line data', async () => {
    const events = await collect(readServerSentEvents(streamOf([
      ': keep-alive\r\n\r\nevent: ping\r',
      '\ndata: {"a":\r\ndata: 1}\r\n\r\ndata: last',
    ])))
    expect(events).toEqual([
      { event: 'ping', data: '{"a":\n1}' },
      { event: 'message', data: 'last' },
    ])
  })
})

describe('providers', () => {
  it('streams OpenAI chat completions with usage and sends the system prompt first', async () => {
    const { fetch, calls } = fakeFetch(() => sseResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\ndata: [DONE]\n\n',
    ]))
    const events = await collect(createProviders(fetch).openai.streamChat(params))
    expect(events).toEqual([
      { type: 'delta', text: 'Hel' },
      { type: 'delta', text: 'lo' },
      { type: 'usage', inputTokens: 5, outputTokens: 2 },
      { type: 'done', stopReason: 'stop' },
    ])
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(calls[0]?.init.headers.authorization).toBe('Bearer sk-test-123456')
    expect(JSON.parse(calls[0]?.init.body ?? '{}').messages[0]).toEqual({ role: 'system', content: 'Be helpful.' })
  })

  it('streams Anthropic messages', async () => {
    const { fetch, calls } = fakeFetch(() => sseResponse([
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":9}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Merhaba"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]))
    const events = await collect(createProviders(fetch).anthropic.streamChat(params))
    expect(events).toEqual([
      { type: 'delta', text: 'Merhaba' },
      { type: 'usage', inputTokens: 9, outputTokens: 3 },
      { type: 'done', stopReason: 'end_turn' },
    ])
    const body = JSON.parse(calls[0]?.init.body ?? '{}')
    expect(body.system).toBe('Be helpful.')
    expect(calls[0]?.init.headers['x-api-key']).toBe('sk-test-123456')
  })

  it('streams Gemini content and skips thought parts', async () => {
    const { fetch, calls } = fakeFetch(() => sseResponse([
      'data: {"candidates":[{"content":{"parts":[{"text":"plan","thought":true},{"text":"Answer"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"!"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2}}\n\n',
    ]))
    const events = await collect(createProviders(fetch).gemini.streamChat({ ...params, messages: [...params.messages, { role: 'assistant', content: 'Yes' }, { role: 'user', content: 'More' }] }))
    expect(events).toEqual([
      { type: 'delta', text: 'Answer' },
      { type: 'delta', text: '!' },
      { type: 'usage', inputTokens: 4, outputTokens: 2 },
      { type: 'done', stopReason: 'STOP' },
    ])
    expect(calls[0]?.url).toContain('/models/model-1:streamGenerateContent?alt=sse')
    expect(JSON.parse(calls[0]?.init.body ?? '{}').contents.map((item: { role: string }) => item.role)).toEqual(['user', 'model', 'user'])
  })

  it('filters model lists to chat models', async () => {
    const { fetch } = fakeFetch(() => Response.json({ data: [{ id: 'gpt-4.1' }, { id: 'text-embedding-3-small' }, { id: 'gpt-4o-audio-preview' }, { id: 'o3' }, { id: 'dall-e-3' }] }))
    expect((await createProviders(fetch).openai.listModels('sk-test-123456')).map((model) => model.id)).toEqual(['gpt-4.1', 'o3'])
  })

  it('reports HTTP errors with the provider message and never the key', async () => {
    const { fetch } = fakeFetch(() => Response.json({ error: { message: 'Invalid API key provided.' } }, { status: 401 }))
    const failure = createProviders(fetch).openrouter.listModels('sk-secret-value')
    await expect(failure).rejects.toThrow(/HTTP 401: Invalid API key provided\.\. Check the API key\./)
    await expect(failure).rejects.not.toThrow(/sk-secret-value/)
  })
})

describe('AI service', () => {
  let directory = ''

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
    directory = ''
  })

  async function makeService(fetch: FetchLike) {
    directory = await mkdtemp(join(tmpdir(), 'dijiteo-ai-'))
    const settings = new Map<string, string>()
    const events: ChatEvent[] = []
    const credentialsPath = join(directory, 'keys.json')
    const service = new AiService({
      credentials: new CredentialStore(credentialsPath, fakeEncryptor),
      fetch,
      getSetting: (key) => settings.get(key) ?? null,
      setSetting: (key, value) => { if (value === null) settings.delete(key); else settings.set(key, value) },
      emit: (event) => events.push(event),
    })
    return { service, events, settings, credentialsPath }
  }

  it('verifies a key before saving it encrypted, and clears the selection when removed', async () => {
    const { fetch } = fakeFetch(() => Response.json({ data: [{ id: 'claude-x', display_name: 'Claude X' }] }))
    const { service, credentialsPath } = await makeService(fetch)
    await expect(service.saveKey('anthropic', 'short')).rejects.toThrow(/full API key/)
    expect(await service.saveKey('anthropic', ' sk-ant-123456789 ')).toEqual([{ id: 'claude-x', name: 'Claude X' }])
    expect(await readFile(credentialsPath, 'utf8')).not.toContain('sk-ant-123456789')
    expect(service.listProviders().find((provider) => provider.id === 'anthropic')?.configured).toBe(true)
    service.setSelection({ providerId: 'anthropic', modelId: 'claude-x' })
    expect(service.getSelection()).toEqual({ providerId: 'anthropic', modelId: 'claude-x' })
    service.removeKey('anthropic')
    expect(service.getSelection()).toBeNull()
    expect(service.listProviders().every((provider) => !provider.configured)).toBe(true)
  })

  it('does not save a key the provider rejects', async () => {
    const { fetch } = fakeFetch(() => new Response('denied', { status: 403 }))
    const { service } = await makeService(fetch)
    await expect(service.saveKey('gemini', 'AIza-test-key-123')).rejects.toThrow(/HTTP 403/)
    expect(service.listProviders().find((provider) => provider.id === 'gemini')?.configured).toBe(false)
  })

  it('streams chat events to the renderer and attaches the open file to the system prompt', async () => {
    const { fetch, calls } = fakeFetch((call) => call.init.method === 'GET'
      ? Response.json({ data: [{ id: 'gpt-4.1' }] })
      : sseResponse(['data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n']))
    const { service, events } = await makeService(fetch)
    await service.saveKey('openai', 'sk-test-123456')
    const chatId = '123e4567-e89b-42d3-a456-426614174000'
    service.startChat(chatId, {
      providerId: 'openai',
      modelId: 'gpt-4.1',
      messages: [{ role: 'user', content: 'Explain' }],
      contextFile: { path: 'src\\app.ts', content: 'export const x = 1' },
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(events).toEqual([
      { chatId, type: 'delta', text: 'OK' },
      { chatId, type: 'done', stopReason: 'stop' },
    ])
    const system = JSON.parse(calls[1]?.init.body ?? '{}').messages[0].content
    expect(system).toContain('src\\app.ts')
    expect(system).toContain('export const x = 1')
  })

  it('validates chat requests', () => {
    expect(() => validateChatRequest({ providerId: 'nope', modelId: 'x', messages: [] })).toThrow()
    expect(() => validateChatRequest({ providerId: 'openai', modelId: 'x', messages: [{ role: 'assistant', content: 'hi' }] })).toThrow(/Write a message/)
    expect(validateChatRequest({
      providerId: 'openai',
      modelId: 'x',
      messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: '' }, { role: 'user', content: 'b' }],
    }).messages).toHaveLength(2)
    expect(buildSystemPrompt()).not.toContain('workspace file open')
  })
})
