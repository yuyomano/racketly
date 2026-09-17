declare module 'open-location-code/openlocationcode.js' {
  export class OpenLocationCode {
    encode(latitude: number, longitude: number, codeLength?: number): string
    decode(code: string): { latitudeCenter: number; longitudeCenter: number }
    isValid(code: string): boolean
    isFull(code: string): boolean
  }
}
