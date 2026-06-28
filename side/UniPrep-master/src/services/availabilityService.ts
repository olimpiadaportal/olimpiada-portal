// availabilityService.ts
// Phase 3 — Teacher Availability Management
// CRUD for teacher_availability (weekly schedule) and teacher_time_off (date blocks)

import { supabase } from './supabase';
import { TeacherAvailability } from '../types/teacher';

export interface TeacherTimeOff {
  id: string;
  teacher_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  reason: string | null;
  created_at: string;
}

export interface AvailabilitySlot {
  day_of_week: number; // 0=Sun … 6=Sat
  start_time: string;  // HH:mm
  end_time: string;    // HH:mm
  is_available: boolean;
}

// Day labels (index = day_of_week value)
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Default time options for the picker (07:00 – 22:00)
export const TIME_OPTIONS: string[] = Array.from({ length: 16 }, (_, i) => {
  const hour = i + 7;
  return `${String(hour).padStart(2, '0')}:00`;
});

class AvailabilityService {
  // ─── Weekly Schedule ────────────────────────────────────────────────────────

  async getAvailability(teacherId: string): Promise<TeacherAvailability[]> {
    try {
      const { data, error } = await supabase
        .from('teacher_availability')
        .select('*')
        .eq('teacher_id', teacherId)
        .order('day_of_week', { ascending: true });

      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.id,
        teacher_id: row.teacher_id,
        day_of_week: row.day_of_week,
        start_time: row.start_time.substring(0, 5), // strip seconds
        end_time: row.end_time.substring(0, 5),
        is_available: row.is_available,
      }));
    } catch (error) {
      console.error('getAvailability error:', error);
      return [];
    }
  }

  // Upsert a single day's availability (insert or update by teacher_id + day_of_week)
  async upsertDayAvailability(
    teacherId: string,
    slot: AvailabilitySlot
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('teacher_availability')
        .upsert(
          {
            teacher_id: teacherId,
            day_of_week: slot.day_of_week,
            start_time: slot.start_time,
            end_time: slot.end_time,
            is_available: slot.is_available,
          },
          { onConflict: 'teacher_id,day_of_week' }
        );

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('upsertDayAvailability error:', error);
      return false;
    }
  }

  // Delete a day's availability (teacher marks that day as not set)
  async deleteDayAvailability(teacherId: string, dayOfWeek: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('teacher_availability')
        .delete()
        .eq('teacher_id', teacherId)
        .eq('day_of_week', dayOfWeek);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('deleteDayAvailability error:', error);
      return false;
    }
  }

  // Replace entire weekly schedule atomically
  async replaceWeeklySchedule(
    teacherId: string,
    slots: AvailabilitySlot[]
  ): Promise<boolean> {
    try {
      // Delete all existing rows for this teacher
      const { error: deleteError } = await supabase
        .from('teacher_availability')
        .delete()
        .eq('teacher_id', teacherId);

      if (deleteError) throw deleteError;

      if (slots.length === 0) return true;

      const rows = slots.map(s => ({
        teacher_id: teacherId,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        is_available: s.is_available,
      }));

      const { error: insertError } = await supabase
        .from('teacher_availability')
        .insert(rows);

      if (insertError) throw insertError;
      return true;
    } catch (error) {
      console.error('replaceWeeklySchedule error:', error);
      return false;
    }
  }

  // ─── Time Off ────────────────────────────────────────────────────────────────

  async getTimeOff(teacherId: string): Promise<TeacherTimeOff[]> {
    try {
      const { data, error } = await supabase
        .from('teacher_time_off')
        .select('*')
        .eq('teacher_id', teacherId)
        .gte('end_date', new Date().toISOString().split('T')[0]) // only future/current
        .order('start_date', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('getTimeOff error:', error);
      return [];
    }
  }

  async addTimeOff(
    teacherId: string,
    startDate: string,
    endDate: string,
    reason?: string
  ): Promise<TeacherTimeOff | null> {
    try {
      const { data, error } = await supabase
        .from('teacher_time_off')
        .insert({
          teacher_id: teacherId,
          start_date: startDate,
          end_date: endDate,
          reason: reason || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('addTimeOff error:', error);
      return null;
    }
  }

  async deleteTimeOff(timeOffId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('teacher_time_off')
        .delete()
        .eq('id', timeOffId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('deleteTimeOff error:', error);
      return false;
    }
  }

  // ─── Status RPC ──────────────────────────────────────────────────────────────

  async getAvailabilityStatus(
    teacherId: string
  ): Promise<'available' | 'busy' | 'offline'> {
    try {
      const { data, error } = await supabase.rpc(
        'get_teacher_availability_status',
        { p_teacher_id: teacherId }
      );

      if (error) throw error;
      return (data as 'available' | 'busy' | 'offline') || 'busy';
    } catch (error) {
      console.error('getAvailabilityStatus error:', error);
      return 'busy';
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  // Get teacher_id from auth user_id
  async getTeacherIdFromUserId(userId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      return data?.id || null;
    } catch (error) {
      console.error('getTeacherIdFromUserId error:', error);
      return null;
    }
  }

  // Check if a specific date is blocked by time-off
  isDateBlockedByTimeOff(date: string, timeOffList: TeacherTimeOff[]): boolean {
    return timeOffList.some(
      t => date >= t.start_date && date <= t.end_date
    );
  }

  // Format time for display (e.g. "09:00" → "9:00 AM")
  formatTime(time: string): string {
    const [hourStr, minStr] = time.split(':');
    const hour = parseInt(hourStr, 10);
    const min = minStr || '00';
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${min} ${period}`;
  }
}

export const availabilityService = new AvailabilityService();
