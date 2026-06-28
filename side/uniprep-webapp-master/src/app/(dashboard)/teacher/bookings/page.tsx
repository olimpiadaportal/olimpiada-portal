"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { 
  ArrowLeft, 
  MapPin,
  Calendar,
  Clock,
  Video,
  CheckCircle,
  X,
} from "lucide-react"
import { CardSkeleton } from "@/components/ui/skeleton"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { useToast } from "@/contexts/ToastContext"
import { getTranslatedSubjectName } from "@/lib/utils/subjectTranslation"
import { teacherService } from "@/services/teacherService"
import { BookingWithDetails, BookingStatus } from "@/types/teacher"
import { NotificationCenter } from "@/components/NotificationCenter"
import { ProfileDrawer } from "@/components/shared/ProfileDrawer"

function TeacherBookingsContent() {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab') || 'pending'
  const { success: showSuccess, info: showInfo } = useToast()

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [bookings, setBookings] = useState<BookingWithDetails[]>([])
  const [activeTab, setActiveTab] = useState(initialTab)
  const [actionBookingId, setActionBookingId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<'accept' | 'reject' | 'complete' | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    loadBookings()
  }, [])

  // Realtime: auto-refresh when any of this teacher's bookings change (e.g. student pays)
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel = supabase
      .channel('teacher-bookings-realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `teacher_user_id=eq.${userId}`,
      }, () => loadBookings())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const loadBookings = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setUserId(user.id)

      // Get teacher bookings
      const data = await teacherService.getTeacherBookings(user.id)
      setBookings(data)
    } catch (error) {
      console.error("Error loading bookings:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async () => {
    if (!actionBookingId || !actionType) return

    try {
      setProcessing(true)

      switch (actionType) {
        case 'accept':
          const result = await teacherService.acceptBooking(actionBookingId)
          if (result.success) {
            if (result.paymentRequired) {
              // Payment is required - booking moves to awaiting_payment
              setBookings(prev => prev.map(b => 
                b.id === actionBookingId 
                  ? { ...b, status: 'awaiting_payment' as BookingStatus, payment_status: 'pending_payment' }
                  : b
              ))
              // Show info that student will be notified
              showInfo(
                t('teacher.bookings.awaitingPaymentToast').replace('{price}', result.price?.toFixed(2) ?? '—'),
                t('teachers.bookings.status.awaiting_payment')
              )
            } else {
              // Free booking - confirmed immediately
              setBookings(prev => prev.map(b =>
                b.id === actionBookingId
                  ? { ...b, status: 'confirmed' as BookingStatus }
                  : b
              ))
              showSuccess(t('teacher.bookings.bookingConfirmed'))
            }
          }
          break
        case 'reject':
          const rejectSuccess = await teacherService.rejectBooking(actionBookingId)
          if (rejectSuccess) {
            setBookings(prev => prev.map(b => 
              b.id === actionBookingId 
                ? { ...b, status: 'cancelled' as BookingStatus }
                : b
            ))
          }
          break
        case 'complete':
          const completeSuccess = await teacherService.completeBooking(actionBookingId)
          if (completeSuccess) {
            setBookings(prev => prev.map(b => 
              b.id === actionBookingId 
                ? { ...b, status: 'completed' as BookingStatus }
                : b
            ))
          }
          break
      }
    } catch (error) {
      console.error("Error processing booking action:", error)
    } finally {
      setProcessing(false)
      setActionBookingId(null)
      setActionType(null)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString(locale === 'az' ? 'az-AZ' : locale === 'ru' ? 'ru-RU' : 'en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const getStatusBadge = (status: BookingStatus) => {
    const styles: Record<BookingStatus, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
      cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
      awaiting_payment: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
    }

    return (
      <Badge className={styles[status]}>
        {status === 'awaiting_payment'
          ? (t('teachers.bookings.status.awaiting_payment') || 'Awaiting Payment')
          : t(`teachers.bookings.status.${status}`)}
      </Badge>
    )
  }

  const filterBookings = (filter: string) => {
    const now = new Date()
    
    switch (filter) {
      case 'pending':
        return bookings.filter(b => b.status === 'pending')
      case 'upcoming':
        return bookings.filter(b =>
          (b.status === 'confirmed' || b.status === 'awaiting_payment') &&
          new Date(`${b.scheduled_date}T${b.scheduled_time}`) > now
        )
      case 'past':
        return bookings.filter(b => b.status === 'completed')
      case 'all':
        return bookings
      default:
        return bookings
    }
  }

  const renderBookingCard = (booking: BookingWithDetails) => {
    const isUpcoming = booking.status === 'confirmed'
    const isPending = booking.status === 'pending'
    const isAwaitingPayment = booking.status === 'awaiting_payment'

    return (
      <Card key={booking.id} className="p-4 bg-white dark:bg-gray-800 mb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            {booking.student.avatar_url ? (
              <img
                src={booking.student.avatar_url}
                alt={booking.student.full_name}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                <span className="text-lg font-bold text-blue-900 dark:text-blue-400">
                  {booking.student.full_name.charAt(0)}
                </span>
              </div>
            )}
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {booking.student.full_name}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {getTranslatedSubjectName(booking.subject, locale)}
              </p>
            </div>
          </div>
          {getStatusBadge(booking.status)}
        </div>

        {/* Awaiting payment info for teacher */}
        {isAwaitingPayment && (
          <div className="mb-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
            <p className="text-sm text-purple-800 dark:text-purple-300 font-medium">
              {t('teachers.bookings.awaitingPaymentTeacher').replace('{price}', String(booking.price))}
            </p>
          </div>
        )}

        <div className="space-y-2 mb-4">
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
            <Calendar className="h-4 w-4 mr-2" />
            {formatDate(booking.scheduled_date)} at {booking.scheduled_time}
          </div>
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
            <Clock className="h-4 w-4 mr-2" />
            {booking.duration_hours} {t('teachers.booking.hours')} • {booking.service_type === 'hourly' ? t('teachers.booking.hourly') : t('teachers.booking.monthly')}
          </div>
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
            {booking.session_method === 'online' ? (
              <>
                <Video className="h-4 w-4 mr-2" />
                {t('teachers.booking.online')}
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 mr-2" />
                {booking.location || t('teachers.booking.inPerson')}
              </>
            )}
          </div>
          {booking.notes && (
            <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm text-gray-700 dark:text-gray-300">
              <strong>{t('teachers.booking.notes')}:</strong> {booking.notes}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-lg font-bold text-blue-900 dark:text-blue-400">
            ₼{booking.price}
          </div>
          <div className="flex gap-2">
            {isPending && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                  onClick={() => {
                    setActionBookingId(booking.id)
                    setActionType('reject')
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  {t('teachers.bookings.reject')}
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => {
                    setActionBookingId(booking.id)
                    setActionType('accept')
                  }}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {t('teachers.bookings.accept')}
                </Button>
              </>
            )}
            {isUpcoming && (
              <Button
                size="sm"
                className="bg-blue-900 hover:bg-blue-800 text-white"
                onClick={() => {
                  setActionBookingId(booking.id)
                  setActionType('complete')
                }}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                {t('teachers.bookings.markComplete')}
              </Button>
            )}
          </div>
        </div>
      </Card>
    )
  }

  const renderEmptyState = (filter: string) => (
    <Card className="p-8 text-center bg-white dark:bg-gray-800">
      <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {t('teachers.bookings.noBookings')}
      </h3>
      <p className="text-gray-600 dark:text-gray-400">
        {t('teachers.bookings.noBookingsDesc')}
      </p>
    </Card>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-8 animate-pulse"></div>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push('/teacher/dashboard')}
              className="text-gray-600 dark:text-gray-400"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('teacher.bookings.title')}
              </h1>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <NotificationCenter userId={userId} />
            <ProfileDrawer userType="teacher" />
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 bg-white dark:bg-gray-800 p-1 rounded-lg shadow-sm">
            <TabsTrigger 
              value="pending"
              className="data-[state=active]:bg-yellow-100 data-[state=active]:text-yellow-800 dark:data-[state=active]:bg-yellow-900/30 dark:data-[state=active]:text-yellow-400"
            >
              <span className="flex items-center gap-2">
                {t('teacher.bookings.tabs.pending')}
                {filterBookings('pending').length > 0 && (
                  <Badge className="bg-yellow-500 text-white text-xs px-1.5 py-0.5">
                    {filterBookings('pending').length}
                  </Badge>
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="upcoming"
              className="data-[state=active]:bg-green-100 data-[state=active]:text-green-800 dark:data-[state=active]:bg-green-900/30 dark:data-[state=active]:text-green-400"
            >
              <span className="flex items-center gap-2">
                {t('teacher.bookings.tabs.upcoming')}
                {filterBookings('upcoming').length > 0 && (
                  <Badge className="bg-green-500 text-white text-xs px-1.5 py-0.5">
                    {filterBookings('upcoming').length}
                  </Badge>
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="past"
              className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800 dark:data-[state=active]:bg-blue-900/30 dark:data-[state=active]:text-blue-400"
            >
              {t('teacher.bookings.tabs.past')}
            </TabsTrigger>
            <TabsTrigger 
              value="all"
              className="data-[state=active]:bg-gray-200 data-[state=active]:text-gray-800 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-gray-200"
            >
              {t('teacher.bookings.tabs.all')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {filterBookings('pending').length === 0 
              ? renderEmptyState('pending')
              : filterBookings('pending').map(renderBookingCard)
            }
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-4">
            {filterBookings('upcoming').length === 0 
              ? renderEmptyState('upcoming')
              : filterBookings('upcoming').map(renderBookingCard)
            }
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {filterBookings('past').length === 0 
              ? renderEmptyState('past')
              : filterBookings('past').map(renderBookingCard)
            }
          </TabsContent>

          <TabsContent value="all" className="space-y-4">
            {filterBookings('all').length === 0 
              ? renderEmptyState('all')
              : filterBookings('all').map(renderBookingCard)
            }
          </TabsContent>
        </Tabs>
      </div>

      {/* Action Confirmation Dialog */}
      <AlertDialog open={!!actionBookingId} onOpenChange={() => {
        setActionBookingId(null)
        setActionType(null)
      }}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              {actionType === 'accept' && t('teacher.bookings.acceptConfirm')}
              {actionType === 'reject' && t('teacher.bookings.declineConfirm')}
              {actionType === 'complete' && t('teacher.bookings.completeConfirm')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 dark:text-gray-400">
              {actionType === 'accept' && t('teacher.bookings.bookingAccepted')}
              {actionType === 'reject' && t('teacher.bookings.bookingDeclined')}
              {actionType === 'complete' && t('teacher.bookings.sessionCompleted')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing} className="dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction}
              disabled={processing}
              className={
                actionType === 'reject' 
                  ? "bg-red-600 hover:bg-red-700 text-white" 
                  : actionType === 'accept'
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }
            >
              {processing ? t('common.loading') : t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function TeacherBookingsPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <TeacherBookingsContent />
    </Suspense>
  )
}
