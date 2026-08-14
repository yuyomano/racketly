import { redirect, notFound } from 'next/navigation'
import { getSessionUser, gatewayFetch } from '@/lib/auth-web'
import { CourseDetailClient } from './CourseDetailClient'

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { id } = await params
  const res = await gatewayFetch(`/api/courses/${id}`)
  if (!res.ok) notFound()
  const course = (await res.json()).data

  return <CourseDetailClient course={course} userId={user.id} />
}
