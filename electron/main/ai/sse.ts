export interface SseEvent {
  event: string
  data: string
}

function parseBlock(block: string): SseEvent | null {
  let event = ''
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    let value = colon < 0 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  return data.length ? { event: event || 'message', data: data.join('\n') } : null
}

export async function* readServerSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      let text = buffer + decoder.decode(value ?? new Uint8Array(), { stream: !done })
      let held = ''
      if (!done && text.endsWith('\r')) {
        held = '\r'
        text = text.slice(0, -1)
      }
      text = text.replace(/\r\n|\r/g, '\n')
      let boundary = text.indexOf('\n\n')
      while (boundary >= 0) {
        const event = parseBlock(text.slice(0, boundary))
        if (event) yield event
        text = text.slice(boundary + 2)
        boundary = text.indexOf('\n\n')
      }
      buffer = text + held
      if (done) {
        const event = parseBlock(buffer)
        if (event) yield event
        return
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}
