/** 可靠执行日志的计费边界：未确认结果不自动重发，只有显式授权才换新的执行身份。 */
import { expect, it, vi } from 'vitest'
import { ReliableByokChatClient } from './reliable-byok-chat'
import type { ByokConfig } from './byok-chat'
import type { LocalTemporaryRequest, TemporaryRequestStore } from './temporary-request-store'

const config: ByokConfig = { protocol: 'openai-chat-completions', baseUrl: 'https://byok.example/v1', apiKey: 'test-key', model: 'test-model', maxOutputTokens: 1000 }

function fakeStore(rows: LocalTemporaryRequest[] = []) {
  const store = {
    list: async () => rows,
    save: async (row: LocalTemporaryRequest) => {
      const index = rows.findIndex(existing => existing.id === row.id)
      if (index >= 0) rows[index] = row; else rows.push(row)
    },
  }
  return { store: store as unknown as TemporaryRequestStore, rows }
}

const sse = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })

function sendInput(overrides: Partial<Parameters<ReliableByokChatClient['send']>[0]> = {}) {
  return { clientRequestId: 'request-1', operationId: 'operation-1', conversationId: 'conversation-1', taskId: 'task-1', requireComplete: true,
    messages: [{ id: 'message-1', role: 'user' as const, text: 'translate this' }], ...overrides }
}

it('holds a dispatch failure without output as unconfirmed and resends only when the user authorizes it', async () => {
  const { store, rows } = fakeStore()
  const fetchImpl = vi.fn()
    .mockRejectedValueOnce(new TypeError('NetworkError'))
    .mockResolvedValue(sse('data: {"choices":[{"delta":{"content":"translated"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'))
  const client = new ReliableByokChatClient({ config, fetchImpl }, store)
  await expect(client.send(sendInput())).rejects.toMatchObject({ code: 'NETWORK_ERROR', stage: 'dispatch' })
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(rows[0].status).toBe('pending')
  await expect(client.send(sendInput({ clientRequestId: 'request-2' }))).rejects.toThrow('BYOK 上次执行结果未确认')
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  await expect(client.send(sendInput({ clientRequestId: 'request-3', allowUnconfirmedRetry: true }))).resolves.toBe('translated')
  expect(fetchImpl).toHaveBeenCalledTimes(2)
  expect(rows).toHaveLength(2)
  expect(rows[0].status).toBe('failed')
  expect(rows[0].body.supersededBy).toBe(rows[1].body.clientRequestId)
  expect(rows[1].body.clientRequestId).not.toBe('request-3')
  expect(rows[1].status).toBe('completed')
})

it('keeps an output-producing BYOK execution pending and blocks replaying the same operation', async () => {
  const { store, rows } = fakeStore()
  const deltas: string[] = []
  const fetchImpl = vi.fn(async () => sse('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'))
  const client = new ReliableByokChatClient({ config, fetchImpl }, store)
  await expect(client.send(sendInput({ onTextDelta: delta => { deltas.push(delta) } }))).rejects.toMatchObject({ code: 'STREAM_EARLY_EOF', executionState: 'unknown' })
  expect(deltas).toEqual(['partial'])
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(rows[0].status).toBe('pending')
  expect(rows[0].text).toBe('partial')
  expect(rows[0].issue?.code).toBe('BYOK_EXECUTION_UNCONFIRMED')
  await expect(client.send(sendInput({ clientRequestId: 'request-2', onTextDelta: delta => { deltas.push(delta) } }))).rejects.toThrow('BYOK 上次执行结果未确认')
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})

it('retains partial output even when the caller consumes no deltas, as PDF batches do', async () => {
  const { store, rows } = fakeStore()
  const fetchImpl = vi.fn(async () => sse('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'))
  const client = new ReliableByokChatClient({ config, fetchImpl }, store)
  await expect(client.send(sendInput())).rejects.toMatchObject({ code: 'STREAM_EARLY_EOF' })
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(rows[0].status).toBe('pending')
  expect(rows[0].text).toBe('partial')
  await expect(client.send(sendInput({ clientRequestId: 'request-2' }))).rejects.toThrow('BYOK 上次执行结果未确认')
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})

it('settles a truncated translation batch as failed and replays the retained result without a new charge', async () => {
  const { store, rows } = fakeStore()
  const fetchImpl = vi.fn(async () => sse('data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\n'))
  const client = new ReliableByokChatClient({ config, fetchImpl }, store)
  await expect(client.send(sendInput({ clientFeature: 'translation' }))).rejects.toMatchObject({ code: 'STREAM_INCOMPLETE', executionState: 'partial' })
  expect(rows[0].status).toBe('failed')
  expect(rows[0].resultState).toBe('partial')
  expect(rows[0].text).toBe('partial')
  const redispatch = vi.fn(async () => { throw new TypeError('NetworkError') })
  await expect(new ReliableByokChatClient({ config, fetchImpl: redispatch }, store)
    .send(sendInput({ clientRequestId: 'request-2', clientFeature: 'translation', reuseCompletedOperation: true })))
    .rejects.toMatchObject({ executionState: 'partial' })
  expect(redispatch).not.toHaveBeenCalled()
})
