"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { FormSkeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft,
  Star,
  MapPin,
  Calendar,
  Clock,
  CheckCircle,
  Video,
  Users,
  AlertCircle,
  CreditCard,
} from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { teacherService } from "@/services/teacherService"
import { paymentService } from "@/services/paymentService"
import { availabilityService } from "@/services/availabilityService"
import { TeacherWithDetails, Subject, SessionMethod } from "@/types/teacher"

const DURATION_OPTIONS = [1, 1.5, 2, 2.5, 3]

type SlotsState = 'idle' | 'loading' | 'time_off' | 'no_schedule' | 'ok'

function generateTimeSlots(startTime: string, endTime: string): string[] {
  const slots: string[] = []
  const [startH] = startTime.split(':').map(Number)
  const [endH] = endTime.split(':').map(Number)
  for (let h = startH; h < endH; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
  }
  return slots
}

export default function BookTeacherPage({ params }: { params: Promise<{ teacherId: string }> }) {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const resolvedParams = use(params)
  const teacherId = resolvedParams.teacherId

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [teacher, setTeacher] = useState<TeacherWithDetails | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isBookingsPaid, setIsBookingsPaid] = useState(false)

  // Time slot state
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [slotsState, setSlotsState] = useState<SlotsState>('idle')

  // Form state
  const [selectedSubject, setSelectedSubject] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [sessionMethod, setSessionMethod] = useState<SessionMethod>('online')
  const [duration, setDuration] = useState<number>(1)
  const [location, setLocation] = useState<string>('')
  const [notes, setNotes] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [teacherId])

  // Reload time slots whenever the selected date changes
  useEffect(() => {
    if (selectedDate) {
      loadTimeSlots(selectedDate)
      setSelectedTime('')
    } else {
      setSlotsState('idle')
      setAvailableSlots([])
    }
  }, [selectedDate])

  const loadData = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setUserId(user.id)

      const [teacherData, subjectsData, paidEnabled] = await Promise.all([
        teacherService.getTeacherById(teacherId, user.id),
        teacherService.getSubjects(),
        paymentService.isBookingsPaid(),
      ])

      setTeacher(teacherData)
      setSubjects(subjectsData)
      setIsBookingsPaid(paidEnabled)

      // Set minimum date to tomorrow
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setSelectedDate(tomorrow.toISOString().split('T')[0])
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadTimeSlots = async (dateStr: string) => {
    setSlotsState('loading')
    setAvailableSlots([])

    try {
      const [availability, timeOff] = await Promise.all([
        availabilityService.getAvailability(teacherId),
        availabilityService.getTimeOff(teacherId),
      ])

      // Check if date falls within a time-off period
      const isTimeOff = timeOff.some(
        (period) => dateStr >= period.start_date && dateStr <= period.end_date
      )
      if (isTimeOff) {
        setSlotsState('time_off')
        return
      }

      // Find availability for this day of week (getDay: 0=Sun, 6=Sat)
      const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay()
      const daySchedule = availability.find(
        (a) => a.day_of_week === dayOfWeek && a.is_available
      )

      if (!daySchedule) {
        setSlotsState('no_schedule')
        return
      }

      // Generate hourly slots from teacher schedule
      let slots = generateTimeSlots(daySchedule.start_time, daySchedule.end_time)

      // Disable past hours if selected date is today
      const today = new Date()
      const selectedDateObj = new Date(dateStr + 'T12:00:00')
      if (selectedDateObj.toDateString() === today.toDateString()) {
        const currentHour = today.getHours()
        slots = slots.filter((slot) => {
          const [slotHour] = slot.split(':').map(Number)
          return slotHour > currentHour
        })
      }

      setAvailableSlots(slots)
      setSlotsState(slots.length > 0 ? 'ok' : 'no_schedule')
    } catch {
      setSlotsState('no_schedule')
    }
  }

  const calculatePrice = (): number => {
    if (!teacher) return 0
    return teacher.hourly_rate * duration
  }

  const handleSubmit = async () => {
    if (!userId || !selectedSubject || !selectedDate || !selectedTime) return

    try {
      setSubmitting(true)

      if (isBookingsPaid) {
        // Paid flow: create booking via payment Edge Function
        const result = await paymentService.initiateBookingPayment({
          teacherId,
          subjectId: selectedSubject,
          scheduledDate: selectedDate,
          scheduledTime: selectedTime,
          durationHours: duration,
          sessionMethod,
          serviceType: 'hourly',
          notes: notes || undefined,
          location: sessionMethod === 'in-person' ? location : undefined,
        })
        if (result) {
          setSuccess(true)
        }
      } else {
        // Free flow: create booking directly
        const bookingId = await teacherService.createBooking(userId, {
          teacher_id: teacherId,
          subject_id: selectedSubject,
          scheduled_date: selectedDate,
          scheduled_time: selectedTime,
          duration_hours: duration,
          session_method: sessionMethod,
          service_type: 'hourly',
          location: sessionMethod === 'in-person' ? location : undefined,
          notes: notes || undefined,
        })
        if (bookingId) {
          setSuccess(true)
        }
      }
    } catch (error) {
      console.error("Error creating booking:", error)
    } finally {
      setSubmitting(false)
    }
  }

  const getSubjectName = (subject: Subject) => {
    return locale === 'az' ? subject.name_az : subject.name_en
  }

  const isFormValid = selectedSubject && selectedDate && selectedTime &&
    (sessionMethod === 'online' || location) &&
    slotsState === 'ok'

  if (loading) {
    return <FormSkeleton />
  }

  if (!teacher) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="p-8 text-center bg-white dark:bg-gray-800 max-w-md">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t('teachers.noTeachers')}
          </h3>
          <Button onClick={() => router.push('/student/teachers')}>
            {t('common.back')}
          </Button>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="p-8 text-center bg-white dark:bg-gray-800 max-w-md">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {t('teachers.booking.bookingSuccess')}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {isBookingsPaid
              ? t('teachers.booking.bookingSuccessPayDesc') || "Your booking request has been sent. You'll be notified to complete payment once the teacher accepts."
              : t('teachers.booking.bookingSuccessDesc')}
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push('/student/bookings')}
            >
              {t('teachers.bookings.title')}
            </Button>
            <Button
              className="flex-1 bg-blue-900 hover:bg-blue-800 text-white"
              onClick={() => router.push('/student/teachers')}
            >
              {t('teachers.bookings.findTeachers')}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const price = calculatePrice()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router.push(`/student/teachers/${teacherId}`)}
          className="mb-6 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('common.back')}
        </Button>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('teachers.booking.title')}
          </h1>
        </div>

        {/* Teacher Info Card */}
        <Card className="p-4 mb-6 bg-white dark:bg-gray-800">
          <div className="flex items-center space-x-4">
            {teacher.avatar_url ? (
              <img
                src={teacher.avatar_url}
                alt={teacher.full_name}
                className="w-14 h-14 rounded-full object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                <span className="text-xl font-bold text-blue-900 dark:text-blue-400">
                  {teacher.full_name.charAt(0)}
                </span>
              </div>
            )}
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {teacher.full_name}
              </h3>
              <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 mr-1" />
                {teacher.rating.toFixed(1)}
                <span className="mx-2">•</span>
                <MapPin className="h-4 w-4 mr-1" />
                {teacher.city}
              </div>
            </div>
          </div>
        </Card>

        {/* Booking Form */}
        <Card className="p-6 bg-white dark:bg-gray-800 space-y-6">
          {/* Subject Selection */}
          <div className="space-y-2">
            <Label>
              {t('teachers.booking.selectSubject')} <span className="text-red-500">*</span>
            </Label>
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger>
                <SelectValue placeholder={t('teachers.booking.selectSubject')} />
              </SelectTrigger>
              <SelectContent>
                {subjects
                  .filter(s => teacher.specializations.includes(s.name_en))
                  .map(subject => (
                    <SelectItem key={subject.id} value={subject.id}>
                      {getSubjectName(subject)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Session Method */}
          <div className="space-y-2">
            <Label>{t('teachers.booking.sessionType')}</Label>
            <RadioGroup
              value={sessionMethod}
              onValueChange={(v) => setSessionMethod(v as SessionMethod)}
              className="grid grid-cols-2 gap-4"
            >
              <div
                className={`flex items-center space-x-3 p-4 border rounded-lg cursor-pointer ${
                  sessionMethod === 'online'
                    ? 'border-blue-900 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
                onClick={() => setSessionMethod('online')}
              >
                <RadioGroupItem value="online" id="online" />
                <div className="flex items-center">
                  <Video className="h-5 w-5 mr-2 text-blue-900 dark:text-blue-400" />
                  <Label htmlFor="online" className="cursor-pointer">
                    {t('teachers.booking.online')}
                  </Label>
                </div>
              </div>
              {teacher.can_do_in_person && (
                <div
                  className={`flex items-center space-x-3 p-4 border rounded-lg cursor-pointer ${
                    sessionMethod === 'in-person'
                      ? 'border-blue-900 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                  onClick={() => setSessionMethod('in-person')}
                >
                  <RadioGroupItem value="in-person" id="in-person" />
                  <div className="flex items-center">
                    <Users className="h-5 w-5 mr-2 text-blue-900 dark:text-blue-400" />
                    <Label htmlFor="in-person" className="cursor-pointer">
                      {t('teachers.booking.inPerson')}
                    </Label>
                  </div>
                </div>
              )}
            </RadioGroup>
          </div>

          {/* Location (for in-person) */}
          {sessionMethod === 'in-person' && (
            <div className="space-y-2">
              <Label>
                {t('teachers.booking.location')} <span className="text-red-500">*</span>
              </Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t('teachers.booking.location')}
              />
            </div>
          )}

          {/* Date Selection */}
          <div className="space-y-2">
            <Label>
              {t('teachers.booking.selectDate')} <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="pl-10"
              />
            </div>
          </div>

          {/* Time Selection */}
          <div className="space-y-2">
            <Label>
              {t('teachers.booking.selectTime')} <span className="text-red-500">*</span>
            </Label>

            {slotsState === 'loading' && (
              <div className="flex items-center gap-2 py-4 text-sm text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-900" />
                {t('common.loading')}
              </div>
            )}

            {slotsState === 'time_off' && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {t('teachers.booking.teacherOnTimeOff') || 'The teacher is on leave on this date. Please choose another date.'}
              </div>
            )}

            {slotsState === 'no_schedule' && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400">
                <Clock className="h-4 w-4 flex-shrink-0" />
                {t('teachers.booking.noSchedule') || 'The teacher has no availability on this day. Please choose another date.'}
              </div>
            )}

            {slotsState === 'ok' && availableSlots.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {availableSlots.map((time) => (
                  <Button
                    key={time}
                    type="button"
                    variant={selectedTime === time ? "default" : "outline"}
                    className={selectedTime === time ? "bg-blue-900 text-white" : ""}
                    onClick={() => setSelectedTime(time)}
                  >
                    {time}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('teachers.booking.duration')}</Label>
            <Select value={duration.toString()} onValueChange={(v) => setDuration(parseFloat(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map(d => (
                  <SelectItem key={d} value={d.toString()}>
                    {d} {t('teachers.booking.hours')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t('teachers.booking.notes')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('teachers.booking.notesPlaceholder')}
              rows={3}
            />
          </div>

          {/* Price Summary */}
          {isBookingsPaid ? (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-blue-900 dark:text-blue-400" />
                    {t('teachers.booking.totalPrice') || 'Total Price'}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {t('teachers.booking.payAfterAcceptance') || 'Payment is collected after the teacher accepts your booking.'}
                  </p>
                </div>
                <span className="text-2xl font-bold text-blue-900 dark:text-blue-400">
                  ₼{price % 1 === 0 ? price : price.toFixed(1)}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    {t('teachers.booking.freeService')}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {t('teachers.booking.freeServiceDesc')}
                  </p>
                </div>
                <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                  ₼0
                </span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <Button
            className="w-full bg-blue-900 hover:bg-blue-800 text-white"
            disabled={!isFormValid || submitting}
            onClick={handleSubmit}
          >
            {submitting ? t('common.loading') : t('teachers.booking.confirmBooking')}
          </Button>
        </Card>
      </div>
    </div>
  )
}
