import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { AppError } from '../middleware/error.middleware'
import { recordPayment, resolvePaymentMethod, resolvePaymentMethodDefaultCash } from '../services/payment-ledger.service'
import { toMinutes, hasConflictingClass, hasConflictingBooking } from '../services/schedule-conflict.service'

const router = Router()
const prisma = new PrismaClient()

const slotInclude = {
  professor: true,
  court: { select: { id: true, name: true } },
  bookings: {
    where: { status: 'active' },
    include: { student: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
  },
} as const

// ─── GET /api/classes/:clubId — slots de clase de un club ────────────────────
// ?date=YYYY-MM-DD  ?professorId=  ?upcoming=1 (solo hoy en adelante, status=open, con cupo)
router.get('/:clubId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date, professorId, upcoming } = req.query
    const where: Record<string, unknown> = { clubId: req.params.clubId }
    if (date) where.date = date
    if (professorId) where.professorId = professorId
    if (upcoming === '1') {
      const today = new Date().toISOString().split('T')[0]
      where.date = { gte: today }
      where.status = 'open'
    }

    const slots = await prisma.classSlot.findMany({
      where,
      include: slotInclude,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    })
    return res.json({ success: true, data: slots })
  } catch (err) { return next(err) }
})

// ─── POST /api/classes — crear un slot de clase (admin) ──────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { clubId, professorId, courtId, date, startTime, durationMinutes, maxStudents, price, currency, notes } = req.body
    if (!clubId) throw new AppError('clubId es requerido', 400)
    if (!professorId) throw new AppError('professorId es requerido', 400)
    if (!date || !startTime) throw new AppError('Fecha y hora son requeridas', 400)
    if (typeof price !== 'number' || price < 0) throw new AppError('Precio inválido', 400)

    if (courtId) {
      const startMin = toMinutes(startTime)
      const endMin = startMin + (durationMinutes || 60)
      if (await hasConflictingBooking(courtId, date, startMin, endMin)) {
        throw new AppError('Esta pista ya tiene una reserva confirmada a esa hora', 409)
      }
      if (await hasConflictingClass(courtId, date, startMin, endMin)) {
        throw new AppError('Esta pista ya tiene otra clase programada a esa hora', 409)
      }
    }

    const slot = await prisma.classSlot.create({
      data: {
        clubId, professorId, courtId: courtId || null, date, startTime,
        durationMinutes: durationMinutes || 60,
        maxStudents: maxStudents || 1,
        price, currency: currency || 'USD', notes,
      },
      include: slotInclude,
    })
    return res.status(201).json({ success: true, data: slot })
  } catch (err) { return next(err) }
})

// ─── PATCH /api/classes/:id — editar o cancelar un slot (admin) ──────────────
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courtId, date, startTime, durationMinutes, maxStudents, price, currency, notes, status } = req.body

    const existing = await prisma.classSlot.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError('Clase no encontrada', 404)

    const data: Record<string, unknown> = {}
    if (courtId !== undefined) data.courtId = courtId || null
    if (date !== undefined) data.date = date
    if (startTime !== undefined) data.startTime = startTime
    if (durationMinutes !== undefined) data.durationMinutes = durationMinutes
    if (maxStudents !== undefined) data.maxStudents = maxStudents
    if (price !== undefined) data.price = price
    if (currency !== undefined) data.currency = currency
    if (notes !== undefined) data.notes = notes
    if (status !== undefined) data.status = status

    // Solo revalidar el horario si de verdad cambió algo que afecte cuándo/dónde ocurre la
    // clase, y solo si sigue teniendo pista asignada (sin pista no hay con qué chocar).
    const finalCourtId = courtId !== undefined ? (courtId || null) : existing.courtId
    const scheduleChanged = courtId !== undefined || date !== undefined || startTime !== undefined || durationMinutes !== undefined
    if (finalCourtId && scheduleChanged && status !== 'cancelled') {
      const finalDate = date ?? existing.date
      const finalStartTime = startTime ?? existing.startTime
      const finalDuration = durationMinutes ?? existing.durationMinutes
      const startMin = toMinutes(finalStartTime)
      const endMin = startMin + finalDuration
      if (await hasConflictingBooking(finalCourtId, finalDate, startMin, endMin)) {
        throw new AppError('Esta pista ya tiene una reserva confirmada a esa hora', 409)
      }
      if (await hasConflictingClass(finalCourtId, finalDate, startMin, endMin, existing.id)) {
        throw new AppError('Esta pista ya tiene otra clase programada a esa hora', 409)
      }
    }

    const slot = await prisma.classSlot.update({ where: { id: req.params.id }, data, include: slotInclude })
    return res.json({ success: true, data: slot })
  } catch (err) { return next(err) }
})

// ─── POST /api/classes/:id/book — un alumno (jugador registrado) reserva cupo ─
// en la clase. `studentUserId` siempre debe ser un jugador real de la plataforma —
// tanto la app (el usuario logueado) como el dashboard (búsqueda de jugador) lo
// garantizan; este endpoint no admite alumnos "sueltos" sin cuenta.
// Pago: si `pay` es true se cobra de inmediato — por la app (`paymentMethod`
// se omite y cae a 'card', igual que las reservas de cancha) o desde el dashboard
// (el admin puede mandar explícitamente 'cash'). Si no, la clase queda pendiente
// de pago y se cobra después desde el dashboard con PATCH /bookings/:id/pay.
router.post('/:id/book', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentUserId, studentName, pay, paymentMethod, clubId } = req.body
    if (!studentUserId) throw new AppError('studentUserId es requerido', 400)

    const slot = await prisma.classSlot.findUnique({
      where: { id: req.params.id },
      include: { bookings: { where: { status: 'active' } } },
    })
    if (!slot) throw new AppError('Clase no encontrada', 404)
    if (slot.status !== 'open') throw new AppError('Esta clase ya no está disponible', 400)
    if (slot.bookings.length >= slot.maxStudents) throw new AppError('Esta clase ya no tiene cupos', 400)
    if (slot.bookings.some((b) => b.studentUserId === studentUserId)) {
      throw new AppError('Ya reservaste un cupo en esta clase', 409)
    }

    const wantsToPayNow = pay === true
    const method = wantsToPayNow ? resolvePaymentMethod(paymentMethod) : null

    const booking = await prisma.classBooking.create({
      data: {
        classSlotId: slot.id,
        studentUserId,
        studentName: studentName || 'Alumno',
        amountOwed: slot.price,
        ...(wantsToPayNow && {
          amountPaid: slot.price,
          paymentStatus: 'paid',
          paymentMethod: method as 'cash' | 'card',
          paidAt: new Date(),
        }),
      },
    })

    if (wantsToPayNow && slot.price > 0) {
      await recordPayment({
        clubId: clubId ?? slot.clubId, classBookingId: booking.id,
        playerUserId: studentUserId, playerName: booking.studentName,
        amount: slot.price, currency: slot.currency, method: method!,
      })
    }

    if (slot.bookings.length + 1 >= slot.maxStudents) {
      await prisma.classSlot.update({ where: { id: slot.id }, data: { status: 'full' } })
    }

    return res.status(201).json({ success: true, data: booking })
  } catch (err) { return next(err) }
})

const CLASS_CANCEL_DEADLINE_HOURS = 24

// ─── DELETE /api/classes/bookings/:id — cancelar cupo (alumno o admin) ───────
// Política: cancelar con ≥24h de anticipación a la clase no tiene costo — si ya se
// había pagado (por la app o en el club), se devuelve como crédito del jugador en
// el club. Cancelar con menos de 24h no genera devolución (la clase ya estaba
// comprometida con el profesor).
router.delete('/bookings/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.classBooking.findUnique({
      where: { id: req.params.id },
      include: { classSlot: true },
    })
    if (!existing) throw new AppError('Reserva de clase no encontrada', 404)
    if (existing.status === 'cancelled') throw new AppError('Ya está cancelada', 400)

    const classStart = new Date(`${existing.classSlot.date}T${existing.classSlot.startTime}:00`)
    const hoursUntil = (classStart.getTime() - Date.now()) / (1000 * 60 * 60)
    const refunds = hoursUntil >= CLASS_CANCEL_DEADLINE_HOURS && existing.amountPaid > 0

    const booking = await prisma.classBooking.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    })
    // Si el slot estaba lleno, vuelve a abrir cupo
    await prisma.classSlot.updateMany({
      where: { id: booking.classSlotId, status: 'full' },
      data: { status: 'open' },
    })

    let credit = null
    if (refunds) {
      credit = await prisma.userCredit.create({
        data: {
          userId: existing.studentUserId,
          clubId: existing.classSlot.clubId,
          amount: existing.amountPaid,
          currency: existing.classSlot.currency,
          reason: 'Clase cancelada con más de 24h de anticipación',
          status: 'available',
        },
      })
    }

    return res.json({ success: true, data: booking, refunded: refunds, credit })
  } catch (err) { return next(err) }
})

// ─── PATCH /api/classes/bookings/:id/pay — marcar pagado (efectivo/tarjeta) ──
router.patch('/bookings/:id/pay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const method = resolvePaymentMethodDefaultCash(req.body?.paymentMethod)
    const booking = await prisma.classBooking.findUnique({
      where: { id: req.params.id },
      include: { classSlot: true },
    })
    if (!booking) throw new AppError('Reserva de clase no encontrada', 404)
    if (booking.paymentStatus === 'paid') throw new AppError('Ya está pagada', 400)

    const amountToCollect = booking.amountOwed - booking.amountPaid
    const updated = await prisma.classBooking.update({
      where: { id: req.params.id },
      data: {
        amountPaid: booking.amountOwed,
        paymentStatus: 'paid',
        paymentMethod: method,
        paidAt: new Date(),
      },
    })

    await recordPayment({
      clubId: booking.classSlot.clubId,
      classBookingId: booking.id,
      playerUserId: booking.studentUserId,
      playerName: booking.studentName,
      amount: amountToCollect,
      currency: booking.classSlot.currency,
      method,
    })

    return res.json({ success: true, data: updated })
  } catch (err) { return next(err) }
})

export { router as classesRouter }
