import { OpenLocationCode } from 'open-location-code/openlocationcode.js'

const olc = new OpenLocationCode()

// Longitud estándar (10 caracteres, ~14x14m) — suficiente para ubicar una cancha o punto
// de encuentro sin depender de una dirección formal.
export function encodePlusCode(latitude: number, longitude: number): string {
  return olc.encode(latitude, longitude, 10)
}

// Solo acepta Plus Codes completos (con código de área, ej. "8FHJVGR6+QG"). Los códigos
// cortos (relativos a una ciudad) requieren una ubicación de referencia que no manejamos.
export function decodePlusCode(code: string): { latitude: number; longitude: number } | null {
  const trimmed = code.trim().toUpperCase()
  if (!olc.isValid(trimmed) || !olc.isFull(trimmed)) return null
  const area = olc.decode(trimmed)
  return { latitude: area.latitudeCenter, longitude: area.longitudeCenter }
}
