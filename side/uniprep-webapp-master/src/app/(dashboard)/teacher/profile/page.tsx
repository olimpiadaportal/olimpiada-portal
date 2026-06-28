'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Star, 
  MapPin,
  Users,
  BookOpen,
  CheckCircle,
  Edit,
  Save,
  X,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { teacherService } from '@/services/teacherService';
import { Teacher, TeacherProfileUpdate, ExamGroup } from '@/types/teacher';

const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'History', 'Geography', 'Literature', 'English',
  'Azerbaijani', 'Russian',
];

const GROUPS: ExamGroup[] = ['I', 'II', 'III', 'IV', 'V'];

export default function TeacherProfilePage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Editable fields
  const [bio, setBio] = useState('');
  const [education, setEducation] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [monthlyRate, setMonthlyRate] = useState('');
  const [selectedSpecializations, setSelectedSpecializations] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<ExamGroup[]>([]);

  useEffect(() => {
    loadTeacherProfile();
  }, []);

  const loadTeacherProfile = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setUserId(user.id);

      const teacherData = await teacherService.getTeacherByUserId(user.id);
      if (teacherData) {
        setTeacher(teacherData);
        setBio(teacherData.bio || '');
        setEducation(teacherData.education || '');
        setExperienceYears(teacherData.experience_years?.toString() || '0');
        setHourlyRate(teacherData.hourly_rate?.toString() || '');
        setMonthlyRate(teacherData.monthly_rate?.toString() || '');
        setSelectedSpecializations(teacherData.specializations || []);
        setSelectedGroups(teacherData.available_groups || []);
      }
    } catch (error) {
      console.error('Error loading teacher profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSpecialization = (subject: string) => {
    if (selectedSpecializations.includes(subject)) {
      setSelectedSpecializations(selectedSpecializations.filter(s => s !== subject));
    } else {
      setSelectedSpecializations([...selectedSpecializations, subject]);
    }
  };

  const toggleGroup = (group: ExamGroup) => {
    if (selectedGroups.includes(group)) {
      setSelectedGroups(selectedGroups.filter(g => g !== group));
    } else {
      setSelectedGroups([...selectedGroups, group]);
    }
  };

  const handleSave = async () => {
    if (!userId) return;

    if (selectedSpecializations.length === 0) {
      alert(t('teacher.profile.errors.selectSpecialization'));
      return;
    }

    if (selectedGroups.length === 0) {
      alert(t('teacher.profile.errors.selectGroup'));
      return;
    }

    const hourlyRateNum = parseFloat(hourlyRate);
    if (isNaN(hourlyRateNum) || hourlyRateNum <= 0) {
      alert(t('teacher.profile.errors.invalidHourlyRate'));
      return;
    }

    try {
      setSaving(true);

      const updates: TeacherProfileUpdate = {
        bio,
        education,
        experience_years: parseInt(experienceYears) || 0,
        hourly_rate: hourlyRateNum,
        monthly_rate: monthlyRate ? parseFloat(monthlyRate) : undefined,
        specializations: selectedSpecializations,
        available_groups: selectedGroups,
      };

      const success = await teacherService.updateTeacherProfile(userId, updates);

      if (success) {
        setIsEditing(false);
        await loadTeacherProfile();
      } else {
        alert(t('teacher.profile.errors.updateFailed'));
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      alert(t('teacher.profile.errors.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (teacher) {
      setBio(teacher.bio || '');
      setEducation(teacher.education || '');
      setExperienceYears(teacher.experience_years?.toString() || '0');
      setHourlyRate(teacher.hourly_rate?.toString() || '');
      setMonthlyRate(teacher.monthly_rate?.toString() || '');
      setSelectedSpecializations(teacher.specializations || []);
      setSelectedGroups(teacher.available_groups || []);
    }
    setIsEditing(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-8 animate-pulse"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (!teacher) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {t('profile.notFound')}
          </h1>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="mr-4 text-gray-600 dark:text-gray-400"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('teacher.profile.title')}
            </h1>
          </div>
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)}>
              <Edit className="h-4 w-4 mr-2" />
              {t('teacher.profile.editProfile')}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                <X className="h-4 w-4 mr-2" />
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? t('teacher.profile.saving') : t('teacher.profile.saveChanges')}
              </Button>
            </div>
          )}
        </div>

        {/* Profile Header Card */}
        <Card className="p-6 bg-white dark:bg-gray-800 mb-6">
          <div className="flex items-start space-x-4">
            {teacher.avatar_url ? (
              <img
                src={teacher.avatar_url}
                alt={teacher.full_name}
                className="w-24 h-24 rounded-full object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                <span className="text-3xl font-bold text-blue-900 dark:text-blue-400">
                  {teacher.full_name.charAt(0)}
                </span>
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {teacher.full_name}
                </h2>
                {teacher.is_verified && (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {t('teacher.profile.verified')}
                  </Badge>
                )}
              </div>
              <div className="flex items-center text-gray-600 dark:text-gray-400 mb-2">
                <MapPin className="h-4 w-4 mr-1" />
                {teacher.city || t('profile.notProvided')}
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center">
                  <Star className="h-4 w-4 text-yellow-500 mr-1" />
                  <span className="font-semibold">{teacher.rating?.toFixed(1) || '0.0'}</span>
                  <span className="text-gray-500 ml-1">({teacher.total_reviews} {t('teacher.dashboard.reviews')})</span>
                </div>
                <div className="flex items-center">
                  <Users className="h-4 w-4 mr-1 text-gray-500" />
                  <span>{teacher.total_students} {t('teacher.profile.totalStudents')}</span>
                </div>
                <div className="flex items-center">
                  <BookOpen className="h-4 w-4 mr-1 text-gray-500" />
                  <span>{teacher.total_sessions} {t('teacher.profile.totalSessions')}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Bio */}
        <Card className="p-6 bg-white dark:bg-gray-800 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('teacher.profile.bio')}
          </h3>
          {isEditing ? (
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('teacher.profile.bioPlaceholder')}
              rows={4}
              className="w-full"
            />
          ) : (
            <p className="text-gray-700 dark:text-gray-300">
              {teacher.bio || t('teachers.profile.noBioAvailable')}
            </p>
          )}
        </Card>

        {/* Education & Experience */}
        <Card className="p-6 bg-white dark:bg-gray-800 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('teacher.profile.education')} & {t('teacher.profile.experienceYears')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('teacher.profile.education')}
              </label>
              {isEditing ? (
                <Input
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                  placeholder={t('teacher.profile.educationPlaceholder')}
                />
              ) : (
                <p className="text-gray-700 dark:text-gray-300">
                  {teacher.education || t('profile.notProvided')}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('teacher.profile.experienceYears')}
              </label>
              {isEditing ? (
                <Input
                  type="number"
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                  min="0"
                />
              ) : (
                <p className="text-gray-700 dark:text-gray-300">
                  {teacher.experience_years} {t('teachers.yearsExp')}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Specializations */}
        <Card className="p-6 bg-white dark:bg-gray-800 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('teacher.profile.specializations')}
          </h3>
          {isEditing ? (
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map((subject) => (
                <Badge
                  key={subject}
                  className={`cursor-pointer ${
                    selectedSpecializations.includes(subject)
                      ? 'bg-blue-900 text-white'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                  onClick={() => toggleSpecialization(subject)}
                >
                  {subject}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {teacher.specializations.map((subject) => (
                <Badge key={subject} className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                  {subject}
                </Badge>
              ))}
            </div>
          )}
        </Card>

        {/* Available Groups */}
        <Card className="p-6 bg-white dark:bg-gray-800 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('teacher.profile.availableGroups')}
          </h3>
          {isEditing ? (
            <div className="flex flex-wrap gap-2">
              {GROUPS.map((group) => (
                <Badge
                  key={group}
                  className={`cursor-pointer ${
                    selectedGroups.includes(group)
                      ? 'bg-blue-900 text-white'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                  onClick={() => toggleGroup(group)}
                >
                  {t('common.group')} {group}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {teacher.available_groups.map((group) => (
                <Badge key={group} className="bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                  {t('common.group')} {group}
                </Badge>
              ))}
            </div>
          )}
        </Card>

        {/* Pricing */}
        <Card className="p-6 bg-white dark:bg-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('teacher.profile.pricing')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('teacher.profile.hourlyRate')}
              </label>
              {isEditing ? (
                <Input
                  type="number"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  min="0"
                  step="0.01"
                />
              ) : (
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-400">
                  ₼{teacher.hourly_rate}/{t('common.perHour')}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('teacher.profile.monthlyRate')}
              </label>
              {isEditing ? (
                <Input
                  type="number"
                  value={monthlyRate}
                  onChange={(e) => setMonthlyRate(e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder={t('common.optional')}
                />
              ) : (
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-400">
                  {teacher.monthly_rate ? `₼${teacher.monthly_rate}/${t('common.month')}` : '-'}
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
