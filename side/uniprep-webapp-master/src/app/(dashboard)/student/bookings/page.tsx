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
  Star,
  MapPin,
  Calendar,
  Clock,
  Video,
  X,
  CreditCard,
} from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { useToast } from "@/contexts/ToastContext"
import { teacherService } from "@/services/teacherService"
import { PayNowModal } from "@/components/payment/PayNowModal"
import { BookingWithDetails, BookingStatus } from "@/types/teacher"

function MyBookingsContent() {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { success: showSuccess } = useToast()

  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState<BookingWithDetails[]>([])
  const [cancelBookingId, setCancelBookingId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [payNowBooking, setPayNowBooking] = useState<{ id: string; teacherName: string } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // Handle ?payment=success redirect from Stripe 3DS flow
  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      showSuccess(t('teachers.bookings.paymentSuccess'))
      loadBookings()
      const url = new URL(window.location.href)
      url.searchParams.delete('payment')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  useEffect(() => {
    loadBookings()
  }, [])

  // Realtime: auto-refresh when any of this student's bookings change
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel = supabase
      .channel('student-bookings-realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `student_user_id=eq.${userId}`,
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
      const data = await teacherService.getStudentBookings(user.id)
      setBookings(data)
    } catch (error) {
      console.error("Error loading bookings:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelBooking = async () => {
    if (!cancelBookingId) return

    try {
      setCancelling(true)
      const success = await teacherService.cancelBooking(cancelBookingId)

      if (success) {
        setBookings(prev => prev.map(b =>
          b.id === cancelBookingId
            ? { ...b, status: 'cancelled' as BookingStatus, can_cancel: false }
            : b
        ))
      }
    } catch (error) {
      console.error("Error cancelling booking:", error)
    } finally {
      setCancelling(false)
      setCancelBookingId(null)
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

    const labels: Record<BookingStatus, string> = {
      pending: t('teachers.bookings.status.pending'),
      confirmed: t('teachers.bookings.status.confirmed'),
      completed: t('teachers.bookings.status.completed'),
      cancelled: t('teachers.bookings.status.cancelled'),
      awaiting_payment: t('teachers.bookings.status.awaiting_payment') || 'Awaiting Payment',
    }

    return (
      <Badge className={styles[status]}>
        {labels[status]}
      </Badge>
    )
  }

  const filterBookings = (filter: string) => {
    const now = new Date()

    switch (filter) {
      case 'awaiting_payment':
        return bookings.filter(b => b.status === 'awaiting_payment')
      case 'pending':
        return bookings.filter(b => b.status === 'pending')
      case 'past':
        return bookings.filter(b =>
          b.status === 'completed' ||
          new Date(`${b.scheduled_date}T${b.scheduled_time}`) < now
        )
      case 'cancelled':
        return bookings.filter(b => b.status === 'cancelled')
      default:
        return bookings
    }
  }

  const awaitingPaymentCount = filterBookings('awaiting_payment').length
  const pendingCount = filterBookings('pending').length

  const renderBookingCard = (booking: BookingWithDetails) => (
    <Card key={booking.id} className="p-4 bg-white dark:bg-gray-800 mb-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          {booking.teacher.avatar_url ? (
            <img
              src={booking.teacher.avatar_url}
              alt={booking.teacher.full_name}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
              <span className="text-lg font-bold text-blue-900 dark:text-blue-400">
                {booking.teacher.full_name.charAt(0)}
              </span>
            </div>
          )}
          <div>
            <h3
              className="font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-blue-900 dark:hover:text-blue-400"
              onClick={() => router.push(`/student/teachers/${booking.teacher_id}`)}
            >
              {booking.teacher.full_name}
            </h3>
            <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 mr-1" />
              {booking.teacher.rating.toFixed(1)}
            </div>
          </div>
        </div>
        {getStatusBadge(booking.status)}
      </div>

      {/* Awaiting payment prompt */}
      {booking.status === 'awaiting_payment' && (
        <div className="mb-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
          <p className="text-sm text-purple-800 dark:text-purple-300 font-medium">
            {t('teachers.bookings.awaitingPaymentPrompt')}
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
          {booking.duration_hours} {t('teachers.booking.hours')} • {booking.subject_name}
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
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="text-lg font-bold text-blue-900 dark:text-blue-400">
          ₼{booking.price}
        </div>
        <div className="flex gap-2">
          {booking.status === 'awaiting_payment' && (
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => setPayNowBooking({ id: booking.id, teacherName: booking.teacher.full_name })}
            >
              <CreditCard className="h-4 w-4 mr-1" />
              {t('teachers.bookings.payNow')}
            </Button>
          )}
          {booking.can_cancel && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
              onClick={() => setCancelBookingId(booking.id)}
            >
              <X className="h-4 w-4 mr-1" />
              {t('teachers.bookings.cancelBooking')}
            </Button>
          )}
          {booking.can_review && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/student/teachers/${booking.teacher_id}/review?bookingId=${booking.id}`)}
            >
              <Star className="h-4 w-4 mr-1" />
              {t('teachers.bookings.leaveReview')}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )

  const renderEmptyState = () => (
    <Card className="p-8 text-center bg-white dark:bg-gray-800">
      <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {t('teachers.bookings.noBookings')}
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        {t('teachers.bookings.noBookingsDesc')}
      </p>
      <Button
        className="bg-blue-900 hover:bg-blue-800 text-white"
        onClick={() => router.push('/student/teachers')}
      >
        {t('teachers.bookings.findTeachers')}
      </Button>
    </Card>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t('teachers.myBookings')}
          </h1>
        </div>

        {/* Tabs */}
        <Tabs defaultValue={awaitingPaymentCount > 0 ? 'awaiting_payment' : 'pending'} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="awaiting_payment" className="relative">
              <CreditCard className="h-3 w-3 mr-1" />
              {t('teachers.bookings.paymentTab')}
              {awaitingPaymentCount > 0 && (
                <Badge className="ml-1.5 bg-purple-600 text-white text-[10px] px-1.5 py-0">
                  {awaitingPaymentCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pending">
              {t('teachers.bookings.pending')}
              {pendingCount > 0 && (
                <Badge className="ml-1.5 bg-yellow-500 text-white text-[10px] px-1.5 py-0">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="past">{t('teachers.bookings.past')}</TabsTrigger>
            <TabsTrigger value="cancelled">{t('teachers.bookings.cancelled')}</TabsTrigger>
          </TabsList>

          <TabsContent value="awaiting_payment">
            {filterBookings('awaiting_payment').length === 0
              ? renderEmptyState()
              : filterBookings('awaiting_payment').map(renderBookingCard)
            }
          </TabsContent>

          <TabsContent value="pending">
            {filterBookings('pending').length === 0
              ? renderEmptyState()
              : filterBookings('pending').map(renderBookingCard)
            }
          </TabsContent>

          <TabsContent value="past">
            {filterBookings('past').length === 0
              ? renderEmptyState()
              : filterBookings('past').map(renderBookingCard)
            }
          </TabsContent>

          <TabsContent value="cancelled">
            {filterBookings('cancelled').length === 0
              ? renderEmptyState()
              : filterBookings('cancelled').map(renderBookingCard)
            }
          </TabsContent>
        </Tabs>
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!cancelBookingId} onOpenChange={() => setCancelBookingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('teachers.bookings.cancelBooking')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('teachers.bookings.cancelConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelBooking}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelling ? t('common.loading') : t('teachers.bookings.cancelBooking')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pay Now Modal */}
      {payNowBooking && (
        <PayNowModal
          isOpen={!!payNowBooking}
          onClose={() => setPayNowBooking(null)}
          onSuccess={() => {
            const bookingId = payNowBooking.id
            setPayNowBooking(null)
            // Optimistically move booking out of awaiting_payment immediately
            setBookings(prev => prev.map(b =>
              b.id === bookingId ? { ...b, status: 'confirmed' as BookingStatus } : b
            ))
            showSuccess(t('teachers.bookings.paymentSuccess'))
            // Reload after delay to sync with webhook-confirmed state
            setTimeout(() => loadBookings(), 3000)
          }}
          bookingId={payNowBooking.id}
          teacherName={payNowBooking.teacherName}
        />
      )}
    </div>
  )
}

export default function MyBookingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900" />
      </div>
    }>
      <MyBookingsContent />
    </Suspense>
  )
}
