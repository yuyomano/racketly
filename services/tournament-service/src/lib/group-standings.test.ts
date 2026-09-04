import { describe, it, expect } from 'vitest'
import { computeGroupStandings } from './group-standings'

describe('computeGroupStandings', () => {
  const players = ['p1', 'p2', 'p3', 'p4']

  it('ignora partidos no completados', () => {
    const standings = computeGroupStandings(
      [{ player1Id: 'p1', player2Id: 'p2', winnerId: 'p1', status: 'scheduled', score: [] }],
      players
    )
    expect(standings.every((s) => s.played === 0)).toBe(true)
  })

  it('suma puntos, sets y games con marcador en formato { p1, p2 } (el que guarda el modal del dashboard)', () => {
    const standings = computeGroupStandings(
      [
        {
          player1Id: 'p1',
          player2Id: 'p2',
          winnerId: 'p1',
          status: 'completed',
          score: [
            { p1: 6, p2: 4 },
            { p1: 6, p2: 3 },
          ],
        },
      ],
      players
    )
    const s1 = standings.find((s) => s.playerId === 'p1')!
    const s2 = standings.find((s) => s.playerId === 'p2')!
    expect(s1).toMatchObject({
      played: 1,
      won: 1,
      lost: 0,
      setsWon: 2,
      setsLost: 0,
      gamesWon: 12,
      gamesLost: 7,
      points: 3,
    })
    expect(s2).toMatchObject({
      played: 1,
      won: 0,
      lost: 1,
      setsWon: 0,
      setsLost: 2,
      gamesWon: 7,
      gamesLost: 12,
      points: 0,
    })
  })

  it('suma correctamente con marcador en formato de tupla [p1, p2] (datos legacy de seed)', () => {
    const standings = computeGroupStandings(
      [
        {
          player1Id: 'p1',
          player2Id: 'p2',
          winnerId: 'p2',
          status: 'completed',
          score: [
            [4, 6],
            [3, 6],
          ],
        },
      ],
      players
    )
    const s1 = standings.find((s) => s.playerId === 'p1')!
    expect(s1).toMatchObject({ setsLost: 2, gamesWon: 7, gamesLost: 12, lost: 1 })
  })

  it('regresión: marcador con el campo incorrecto { player1, player2 } ya no cuenta como 0-0 (bug real encontrado en Dyllu Open)', () => {
    const standings = computeGroupStandings(
      [
        {
          player1Id: 'p1',
          player2Id: 'p2',
          winnerId: 'p1',
          status: 'completed',
          score: [{ player1: 6, player2: 2 }],
        },
      ],
      players
    )
    const s1 = standings.find((s) => s.playerId === 'p1')!
    expect(s1.gamesWon).toBe(6)
    expect(s1.gamesLost).toBe(2)
  })

  it('ordena primero por puntos, luego por diferencia de sets, luego por diferencia de games', () => {
    const standings = computeGroupStandings(
      [
        {
          player1Id: 'p1',
          player2Id: 'p2',
          winnerId: 'p1',
          status: 'completed',
          score: [
            { p1: 6, p2: 0 },
            { p1: 6, p2: 0 },
          ],
        },
        {
          player1Id: 'p3',
          player2Id: 'p4',
          winnerId: 'p3',
          status: 'completed',
          score: [
            { p1: 7, p2: 6 },
            { p1: 7, p2: 6 },
          ],
        },
      ],
      players
    )
    // p1 y p3 ganaron (3 pts cada uno) pero p1 tiene mejor diferencia de sets/games → va primero
    expect(standings[0].playerId).toBe('p1')
    expect(standings[1].playerId).toBe('p3')
  })

  it('incluye jugadores sin partidos jugados con estadísticas en cero', () => {
    const standings = computeGroupStandings([], players)
    expect(standings).toHaveLength(4)
    expect(standings.every((s) => s.played === 0 && s.points === 0)).toBe(true)
  })
})
