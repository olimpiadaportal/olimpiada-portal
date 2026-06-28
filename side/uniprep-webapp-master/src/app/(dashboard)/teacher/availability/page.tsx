'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Calendar, Plus, Trash2, Info, CheckCircle, XCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import {
  availabilityService,
  TeacherAvailability,
  TeacherTimeOff,
  DAY_LABELS_FULL,
  TIME_OPTIONS,
} from '@/services/availabilityService';

const ORDERED_DAYS = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sun

export default function TeacherAvailabilityPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<TeacherAvailability[]>([]);
  const [timeOff, setTimeOff] = useState<TeacherTimeOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null); // day being saved

  // Day-edit state
  const [editDay, setEditDay] = useState<number | null>(null);
  const [editStart, setEditStart] = useState('09:00');
  const [editEnd, setEditEnd] = useState('18:00');

  // Time-off form
  const [showTimeOffForm, setShowTimeOffForm] = useState(false);
  const [toStart, setToStart] = useState('');
  const [toEnd, setToEnd] = useState('');
  const [toReason, setToReason] = useState('');
  const [toError, setToError] = useState('');
  const [toSaving, setToSaving] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const tid = await availabilityService.getTeacherIdFromUserId(user.id);
      if (!tid) return;
      setTeacherId(tid);

      const [avail, off] = await Promise.all([
        availabilityService.getAvailability(tid),
        availabilityService.getTimeOff(tid),
      ]);
      setAvailability(avail);
      setTimeOff(off);
    } finally {
      setLoading(false);
    }
  }, [router]);

  const availMap = new Map(availability.map(a => [a.day_of_week, a]));

  const handleOpenEdit = (day: number) => {
    const existing = availMap.get(day);
    setEditStart(existing?.start_time || '09:00');
    setEditEnd(existing?.end_time || '18:00');
    setEditDay(day);
  };

  const handleSaveDay = async () => {
    if (editDay === null || !teacherId) return;
    if (editStart >= editEnd) { showToast('End time must be after start time', 'error'); return; }
    setSaving(editDay);
    const ok = await availabilityService.upsertDayAvailability(teacherId, {
      day_of_week: editDay,
      start_time: editStart,
      end_time: editEnd,
      is_available: true,
    });
    setSaving(null);
    if (ok) {
      setEditDay(null);
      showToast('Availability saved');
      await loadData();
    } else {
      showToast('Failed to save', 'error');
    }
  };

  const handleRemoveDay = async (day: number) => {
    if (!teacherId) return;
    setSaving(day);
    const ok = await availabilityService.deleteDayAvailability(teacherId, day);
    setSaving(null);
    if (ok) { showToast('Day removed'); await loadData(); }
    else showToast('Failed to remove', 'error');
  };

  const handleAddTimeOff = async () => {
    setToError('');
    if (!toStart || !toEnd) { setToError('Both dates are required'); return; }
    if (toEnd < toStart) { setToError('End date must be on or after start date'); return; }
    if (!teacherId) return;
    setToSaving(true);
    const result = await availabilityService.addTimeOff(teacherId, toStart, toEnd, toReason || undefined);
    setToSaving(false);
    if (result) {
      setShowTimeOffForm(false);
      setToStart(''); setToEnd(''); setToReason('');
      showToast('Time off added');
      await loadData();
    } else {
      setToError('Failed to add. Please try again.');
    }
  };

  const handleDeleteTimeOff = async (id: string) => {
    const ok = await availabilityService.deleteTimeOff(id);
    if (ok) { showToast('Time off removed'); await loadData(); }
    else showToast('Failed to remove', 'error');
  };

  const today = new Date().toISOString().split('T')[0];
  const isActive = (item: TeacherTimeOff) => today >= item.start_date && today <= item.end_date;
  const getDays = (s: string, e: string) =>
    Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manage Availability</h1>
        <p className="text-gray-500 text-sm mt-1">Set your weekly schedule and block time-off periods</p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <Info size={18} className="text-blue-600 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-800">
          Set your available hours for each day. Students can only book sessions during these hours.
        </p>
      </div>

      {/* Weekly Schedule */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Clock size={20} className="text-blue-600" />
          Weekly Schedule
        </h2>

        <div className="space-y-2">
          {ORDERED_DAYS.map(day => {
            const slot = availMap.get(day);
            const isSet = !!slot;
            const isSavingThis = saving === day;

            return (
              <div
                key={day}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${isSet ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}
              >
                {/* Day label */}
                <span className={`w-28 text-sm font-semibold ${isSet ? 'text-gray-900' : 'text-gray-500'}`}>
                  {DAY_LABELS_FULL[day]}
                </span>

                {/* Time or placeholder */}
                <div className="flex-1">
                  {isSet ? (
                    <span className="text-sm font-medium text-gray-800">
                      {slot.start_time} – {slot.end_time}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400 italic">Not set</span>
                  )}
                </div>

                {/* Edit / Remove */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEdit(day)}
                    disabled={isSavingThis}
                    className="text-xs"
                  >
                    {isSet ? 'Edit' : 'Set hours'}
                  </Button>
                  {isSet && (
                    <button
                      onClick={() => handleRemoveDay(day)}
                      disabled={isSavingThis}
                      className="text-red-400 hover:text-red-600 transition-colors p-1"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Inline day editor */}
      {editDay !== null && (
        <Card className="p-6 space-y-4 border-blue-300 bg-blue-50">
          <h3 className="font-semibold text-gray-900">
            Set hours for {DAY_LABELS_FULL[editDay]}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <select
                value={editStart}
                onChange={e => setEditStart(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <select
                value={editEnd}
                onChange={e => setEditEnd(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleSaveDay} disabled={saving !== null} className="flex-1">
              {saving === editDay ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="outline" onClick={() => setEditDay(null)} className="flex-1">
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Time Off */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Calendar size={20} className="text-blue-600" />
            Time Off
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowTimeOffForm(v => !v)}
            className="flex items-center gap-1"
          >
            <Plus size={15} />
            Add
          </Button>
        </div>

        {/* Add form */}
        {showTimeOffForm && (
          <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={toStart}
                  onChange={e => setToStart(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={toEnd}
                  onChange={e => setToEnd(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={toReason}
                onChange={e => setToReason(e.target.value)}
                placeholder="e.g. Vacation, sick leave..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {toError && <p className="text-red-600 text-sm">{toError}</p>}
            <div className="flex gap-2">
              <Button onClick={handleAddTimeOff} disabled={toSaving} size="sm" className="flex-1">
                {toSaving ? 'Adding…' : 'Add Time Off'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowTimeOffForm(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* List */}
        {timeOff.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Calendar size={36} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No time off scheduled</p>
          </div>
        ) : (
          <div className="space-y-2">
            {timeOff.map(item => (
              <div
                key={item.id}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${isActive(item) ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {item.start_date === item.end_date ? item.start_date : `${item.start_date} → ${item.end_date}`}
                    {isActive(item) && (
                      <span className="ml-2 text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Active</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {getDays(item.start_date, item.end_date)} day(s)
                    {item.reason ? ` · ${item.reason}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteTimeOff(item.id)}
                  className="text-red-400 hover:text-red-600 transition-colors p-1"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
