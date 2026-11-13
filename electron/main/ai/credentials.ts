import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ProviderId } from '../../../src/shared/ai'

export interface Encryptor {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
}

type StoredKeys = Partial<Record<ProviderId, string>>

export function validateApiKey(value: unknown): string {
  const key = typeof value === 'string' ? value.trim() : ''
  if (key.length < 8 || key.length > 512 || /\s/.test(key)) throw new Error('Paste the full API key without spaces.')
  return key
}

export class CredentialStore {
  constructor(private readonly filePath: string, private readonly encryptor: Encryptor) {}

  private read(): StoredKeys {
    if (!existsSync(this.filePath)) return {}
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      return parsed && typeof parsed === 'object' ? parsed as StoredKeys : {}
    } catch {
      return {}
    }
  }

  private write(keys: StoredKeys): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.tmp`
    writeFileSync(temporary, JSON.stringify(keys, null, 2), 'utf8')
    renameSync(temporary, this.filePath)
  }

  has(providerId: ProviderId): boolean {
    return typeof this.read()[providerId] === 'string'
  }

  get(providerId: ProviderId): string | null {
    const encrypted = this.read()[providerId]
    if (!encrypted) return null
    try {
      return this.encryptor.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      throw new Error('The saved API key could not be decrypted on this Windows account. Enter it again.')
    }
  }

  set(providerId: ProviderId, apiKey: string): void {
    if (!this.encryptor.isEncryptionAvailable()) {
      throw new Error('Windows secure storage is not available, so the API key cannot be saved.')
    }
    const key = providerId.startsWith('custom-') ? apiKey.trim() : validateApiKey(apiKey)
    if (providerId.startsWith('custom-') && (!key || key.length > 512 || /\s/.test(key))) {
      throw new Error('Custom API keys must be 1–512 characters and contain no spaces.')
    }
    const keys = this.read()
    keys[providerId] = this.encryptor.encryptString(key).toString('base64')
    this.write(keys)
  }

  remove(providerId: ProviderId): void {
    const keys = this.read()
    if (!(providerId in keys)) return
    delete keys[providerId]
    this.write(keys)
  }
}
