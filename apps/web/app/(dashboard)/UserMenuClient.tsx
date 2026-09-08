'use client'

import { useEffect, useId, useState } from 'react'
import { Settings, X, Loader2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select as SelectField } from '@/components/ui/Select'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

type Tab = 'perfil' | 'email' | 'password'

type UserData = {
  id: string
  email: string
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  documentType?: string | null
  documentNumber?: string | null
  birthDate?: string | null
  avatarUrl?: string | null
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  toggle,
  disabled,
}: {
  label: string
  type?: string
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  toggle?: boolean
  disabled?: boolean
}) {
  const [show, setShow] = useState(false)
  const id = useId()
  const inputType = toggle ? (show ? 'text' : 'password') : type
  return (
    <FormField label={label} htmlFor={id}>
      <div className="relative">
        <Input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={toggle ? 'pr-9' : undefined}
        />
        {toggle && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </FormField>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const id = useId()
  return (
    <FormField label={label} htmlFor={id}>
      <SelectField id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Seleccionar —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
    </FormField>
  )
}

const DOC_TYPES = [
  { value: 'DNI', label: 'DNI' },
  { value: 'Pasaporte', label: 'Pasaporte' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'NIT', label: 'NIT' },
  { value: 'RUT', label: 'RUT' },
]

export function UserMenuClient({ email: initialEmail }: { email: string }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('perfil')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const [userData, setUserData] = useState<UserData>({ id: '', email: initialEmail })

  // perfil form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [documentNumber, setDocumentNumber] = useState('')
  const [birthDate, setBirthDate] = useState('')

  // email/password forms
  const [newEmail, setNewEmail] = useState(initialEmail)
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')

  // Display name: firstName + lastName, fallback to email prefix
  const displayName = userData.firstName
    ? `${userData.firstName}${userData.lastName ? ' ' + userData.lastName : ''}`
    : initialEmail.split('@')[0]
  const initials = userData.firstName
    ? (userData.firstName[0] + (userData.lastName?.[0] ?? '')).toUpperCase()
    : initialEmail[0].toUpperCase()

  async function loadProfile() {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/me')
      if (!res.ok) return
      const { data } = await res.json()
      setUserData(data)
      setFirstName(data.firstName ?? '')
      setLastName(data.lastName ?? '')
      setPhone(data.phone ?? '')
      setDocumentType(data.documentType ?? '')
      setDocumentNumber(data.documentNumber ?? '')
      setBirthDate(data.birthDate ? data.birthDate.split('T')[0] : '')
      setNewEmail(data.email)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) loadProfile()
  }, [open])

  async function handleSavePerfil() {
    setSaving(true)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          documentType,
          documentNumber,
          birthDate: birthDate || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Error al guardar')
        return
      }
      setUserData((u) => ({
        ...u,
        firstName,
        lastName,
        phone,
        documentType,
        documentNumber,
        birthDate,
      }))
      toast.success('Perfil actualizado correctamente')
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEmail() {
    if (!newEmail.trim() || newEmail === userData.email) return
    setSaving(true)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Error al actualizar')
        return
      }
      toast.success('Email actualizado. Vuelve a iniciar sesión.')
      setTimeout(() => setOpen(false), 2000)
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePassword() {
    if (!currentPwd || !newPwd) {
      toast.error('Completa todos los campos')
      return
    }
    if (newPwd.length < 8) {
      toast.error('La nueva contraseña debe tener al menos 8 caracteres')
      return
    }
    if (newPwd !== confirmPwd) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Error al cambiar contraseña')
        return
      }
      toast.success('Contraseña actualizada correctamente')
      setCurrentPwd('')
      setNewPwd('')
      setConfirmPwd('')
      setTimeout(() => setOpen(false), 1500)
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'perfil', label: 'Perfil' },
    { id: 'email', label: 'Email' },
    { id: 'password', label: 'Contraseña' },
  ]

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 w-full px-0.5 py-1 group"
        title="Ajustes de cuenta"
      >
        <div className="w-8 h-8 rounded-full bg-court-500 flex items-center justify-center text-white text-xs font-bold shrink-0 ring-2 ring-white/10 group-hover:ring-court-400/50 transition-all">
          {initials}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-white/80 text-xs font-semibold truncate leading-tight">
            {displayName}
          </p>
          <p className="text-white/40 text-[10px] truncate">{initialEmail}</p>
        </div>
        <Settings className="w-3.5 h-3.5 text-white/30 group-hover:text-white/60 shrink-0 transition-colors" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} maxWidth="sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-court-500 flex items-center justify-center text-white text-sm font-bold">
              {initials}
            </div>
            <div>
              <p className="font-black text-ink-900 text-sm leading-tight">{displayName}</p>
              <p className="text-ink-400 text-xs">{initialEmail}</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-ink-400 hover:text-ink-600 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ink-100 mb-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                tab === t.id
                  ? 'text-court-600 border-b-2 border-court-500'
                  : 'text-ink-400 hover:text-ink-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && tab === 'perfil' && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-court-500" />
          </div>
        )}

        {!loading && tab === 'perfil' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre" value={firstName} onChange={setFirstName} placeholder="Juan" />
              <Field
                label="Apellido"
                value={lastName}
                onChange={setLastName}
                placeholder="García"
              />
            </div>
            <Field
              label="Teléfono"
              type="tel"
              value={phone}
              onChange={setPhone}
              placeholder="+57 300 000 0000"
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Tipo de documento"
                value={documentType}
                onChange={setDocumentType}
                options={DOC_TYPES}
              />
              <Field
                label="Número"
                value={documentNumber}
                onChange={setDocumentNumber}
                placeholder="12345678"
              />
            </div>
            <Field
              label="Fecha de nacimiento"
              type="date"
              value={birthDate}
              onChange={setBirthDate}
            />
            <Button onClick={handleSavePerfil} disabled={saving} className="w-full">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Guardando…
                </>
              ) : (
                'Guardar perfil'
              )}
            </Button>
          </div>
        )}

        {tab === 'email' && (
          <div className="space-y-4">
            <Field label="Email actual" value={initialEmail} disabled />
            <Field
              label="Nuevo email"
              type="email"
              value={newEmail}
              onChange={setNewEmail}
              placeholder="nuevo@email.com"
            />
            <Button
              onClick={handleSaveEmail}
              disabled={saving || !newEmail.trim() || newEmail === userData.email}
              className="w-full"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Guardando…
                </>
              ) : (
                'Guardar email'
              )}
            </Button>
          </div>
        )}

        {tab === 'password' && (
          <div className="space-y-4">
            <Field
              label="Contraseña actual"
              toggle
              value={currentPwd}
              onChange={setCurrentPwd}
              placeholder="••••••••"
            />
            <Field
              label="Nueva contraseña"
              toggle
              value={newPwd}
              onChange={setNewPwd}
              placeholder="Mínimo 8 caracteres"
            />
            <Field
              label="Confirmar nueva contraseña"
              toggle
              value={confirmPwd}
              onChange={setConfirmPwd}
              placeholder="Repite la contraseña"
            />
            <Button
              onClick={handleSavePassword}
              disabled={saving || !currentPwd || !newPwd || !confirmPwd}
              className="w-full"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Guardando…
                </>
              ) : (
                'Cambiar contraseña'
              )}
            </Button>
          </div>
        )}
      </Modal>
    </>
  )
}
