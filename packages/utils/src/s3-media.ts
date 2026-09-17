import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

// Sube una imagen a S3 o a un bucket compatible (Cloudflare R2 vía AWS_S3_ENDPOINT)
// y devuelve la URL pública. AWS_S3_PUBLIC_URL permite servir el bucket detrás de un
// dominio propio/CDN (ej. R2 con dominio custom) en vez de la URL directa del proveedor.
function getClient(): S3Client {
  return new S3Client({
    region: process.env.AWS_REGION || 'auto',
    endpoint: process.env.AWS_S3_ENDPOINT,
    forcePathStyle: Boolean(process.env.AWS_S3_ENDPOINT),
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })
}

export async function uploadImage(
  buffer: Buffer,
  contentType: string,
  keyPrefix: string
): Promise<string> {
  const bucket = process.env.AWS_S3_BUCKET
  if (!bucket) throw new Error('AWS_S3_BUCKET no está configurado')

  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
  const key = `${keyPrefix}/${randomUUID()}.${ext}`

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  )

  const publicBase =
    process.env.AWS_S3_PUBLIC_URL ||
    `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`
  return `${publicBase.replace(/\/$/, '')}/${key}`
}
