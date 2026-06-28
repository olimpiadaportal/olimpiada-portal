// availabilityService.ts (Web)
// Phase 3 — Teacher Availability Management

import { createClient } from '@/lib/supabase/client';

export interface TeacherAvailability {
  id: string;
  teacher_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

export interface TeacherTimeOff {
  id: string;
  teacher_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: string;
}

export interface AvailabilitySlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const TIME_OPTIONS: string[] = Array.from({ length: 16 }, (_, i) => {
  const hour = i + 7;
  return `${String(hour).padStart(2, '0')}:00`;
});

class AvailabilityService {
  async getTeacherIdFromUserId(userId: string): Promise<string | null> {
    const supabase = createClient();
    const { data } = await supabase
      .from('teachers')
      .select('id')
      .eq('user_id', userId)
      .single();
    return (data as any)?.id ?? null;
  }

  async getAvailability(teacherId: string): Promise<TeacherAvailability[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('teacher_availability')
      .select('*')
      .eq('teacher_id', teacherId)
      .order('day_of_week', { ascending: true });
    if (error) { console.error('getAvailability:', error); return []; }
    return (data || []).map((r: any) => ({
      ...r,
      start_time: r.start_time.substring(0, 5),
      end_time: r.end_time.substring(0, 5),
    }));
  }

  async upsertDayAvailability(teacherId: string, slot: AvailabilitySlot): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase
      .from('teacher_availability')
      .upsert(
        { teacher_id: teacherId, ...slot } as any,
        { onConflict: 'teacher_id,day_of_week' }
      );
    if (error) { console.error('upsertDayAvailability:', error); return false; }
    return true;
  }

  async deleteDayAvailability(teacherId: string, dayOfWeek: number): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase
      .from('teacher_availability')
      .delete()
      .eq('teacher_id', teacherId)
      .eq('day_of_week', dayOfWeek);
    if (error) { console.error('deleteDayAvailability:', error); return false; }
    return true;
  }

  async getTimeOff(teacherId: string): Promise<TeacherTimeOff[]> {
    const supabase = createClient();
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('teacher_time_off')
      .select('*')
      .eq('teacher_id', teacherId)
      .gte('end_date', today)
      .order('start_date', { ascending: true });
    if (error) { console.error('getTimeOff:', error); return []; }
    return data || [];
  }

  async addTimeOff(
    teacherId: string,
    startDate: string,
    endDate: string,
    reason?: string
  ): Promise<TeacherTimeOff | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('teacher_time_off')
      .insert({ teacher_id: teacherId, start_date: startDate, end_date: endDate, reason: reason || null } as any)
      .select()
      .single();
    if (error) { console.error('addTimeOff:', error); return null; }
    return data;
  }

  async deleteTimeOff(id: string): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase.from('teacher_time_off').delete().eq('id', id);
    if (error) { console.error('deleteTimeOff:', error); return false; }
    return true;
  }

  async getAvailabilityStatus(teacherId: string): Promise<'available' | 'busy' | 'offline'> {
    const supabase = createClient();
    const { data, error } = await (supabase as any).rpc('get_teacher_availability_status', { p_teacher_id: teacherId });
    if (error) { console.error('getAvailabilityStatus:', error); return 'busy'; }
    return (data as 'available' | 'busy' | 'offline') || 'busy';
  }
}

export const availabilityService = new AvailabilityService();
