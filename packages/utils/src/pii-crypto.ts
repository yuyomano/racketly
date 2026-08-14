import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'

// Cifrado a nivel de aplicación para campos PII (documentNumber, phone, birthDate).
// AES-256-GCM con IV aleatorio por valor — no determinístico, seguro porque ningún
// query del repo filtra por estos campos (confirmado antes de implementar esto).
// Formato de almacenamiento: "v1:<iv b64>:<authTag b64>:<ciphertext b64>". El
// prefijo "v1:" distingue valores cifrados de texto plano legado — decryptPII
// devuelve tal cual cualquier valor sin ese prefijo, para no romper filas que
// aún no pasaron por la migración de datos existentes.

const PREFIX = 'v1:'
const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('PII_ENCRYPTION_KEY no está configurada — requerida para cifrar/descifrar PII')
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY debe ser 32 bytes en base64 (usar crypto.randomBytes(32).toString("base64"))')
  }
  return key
}

export function encryptPII(value: string): string
export function encryptPII(value: string | null | undefined): string | null
export function encryptPII(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`
}

export function decryptPII(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (!value.startsWith(PREFIX)) return value

  const parts = value.slice(PREFIX.length).split(':')
  if (parts.length !== 3) return value

  const [ivB64, authTagB64, ciphertextB64] = parts
  const key = getKey()
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}
