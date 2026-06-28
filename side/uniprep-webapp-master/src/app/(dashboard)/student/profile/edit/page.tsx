"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { FormSkeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  ArrowLeft, 
  Upload, 
  Save, 
  Loader2,
  X
} from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { profileService } from "@/services/profileService"
import { StudentProfile } from "@/types/settings"

export default function EditProfilePage() {
  const router = useRouter()
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  
  // Form fields
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [targetGroup, setTargetGroup] = useState('')
  const [targetUniversity, setTargetUniversity] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  
  // Universities and cities list
  const [universities, setUniversities] = useState<Array<{id: string, name: string}>>([])
  const [cities, setCities] = useState<Array<{id: string, name: string}>>([])

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    loadProfile()
    loadUniversities()
    loadCities()
  }, [])

  const loadProfile = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      const profileData = await profileService.getProfile(user.id)
      if (profileData) {
        setProfile(profileData)
        setFullName(profileData.full_name || '')
        setPhone(profileData.phone || '')
        // Preload form fields with existing data
        setCity(profileData.city || '')
        setTargetGroup(profileData.target_group || '')
        setTargetUniversity(profileData.target_university || '')
        setBio(profileData.bio || '')
        setAvatarUrl(profileData.avatar_url)
      }
    } catch (error) {
      // Profile load error - silently fail
    } finally {
      setLoading(false)
    }
  }

  const loadUniversities = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('universities')
        .select('id, name')
        .order('name')

      if (error) throw error
      if (data) {
        setUniversities(data)
      }
    } catch (error) {
      // Universities load error - silently fail
    }
  }

  const loadCities = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('cities')
        .select('id, name')
        .order('name')

      if (error) throw error
      if (data) {
        setCities(data)
      }
    } catch (error) {
      // Cities load error - silently fail
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!fullName.trim()) {
      newErrors.fullName = t('profile.errors.nameRequired')
    }

    if (phone && !/^\+?[\d\s-()]+$/.test(phone)) {
      newErrors.phone = t('profile.errors.invalidPhone')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setErrors({ ...errors, avatar: t('profile.errors.invalidImageType') })
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrors({ ...errors, avatar: t('profile.errors.imageTooLarge') })
      return
    }

    setAvatarFile(file)
    
    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
    
    // Clear error
    const newErrors = { ...errors }
    delete newErrors.avatar
    setErrors(newErrors)
  }

  const handleRemoveAvatar = () => {
    setAvatarFile(null)
    setAvatarPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSave = async () => {
    if (!validateForm()) return
    if (!profile) return

    try {
      setSaving(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Upload avatar if changed
      let newAvatarUrl = avatarUrl
      if (avatarFile) {
        setUploading(true)
        newAvatarUrl = await profileService.uploadAvatar(user.id, avatarFile)
        setUploading(false)
      }

      // Update profile
      await profileService.updateProfile(user.id, {
        full_name: fullName,
        phone: phone || undefined,
        avatar_url: newAvatarUrl || undefined,
      })

      // Update student info
      await profileService.updateStudentInfo(user.id, {
        city: city || undefined,
        target_group: targetGroup || undefined,
        target_university: targetUniversity || undefined,
        bio: bio || undefined,
      })

      // Navigate back to profile
      router.push('/student/profile')
    } catch (error) {
      setErrors({ ...errors, general: t('profile.errors.saveFailed') })
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  const getInitials = (name: string) => {
    if (!name) return 'U'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  if (loading) {
    return <FormSkeleton />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-700 dark:to-purple-800 text-white p-8 pb-20 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <Button
            onClick={() => router.push('/student/profile')}
            variant="ghost"
            className="text-white hover:bg-white/20 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            {t('common.back')}
          </Button>
          <h1 className="text-4xl font-bold">{t('profile.editProfile')}</h1>
          <p className="text-blue-50 mt-2">{t('profile.editSubtitle')}</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-8">
        <Card className="p-8 shadow-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          {errors.general && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400">{errors.general}</p>
            </div>
          )}

          {/* Avatar Upload */}
          <div className="mb-8 text-center">
            <Label className="block mb-4 text-lg font-semibold text-gray-900 dark:text-white">{t('profile.avatar')}</Label>
            <div className="flex flex-col items-center gap-4">
              <Avatar className="w-32 h-32 border-4 border-gray-200 dark:border-gray-700">
                <AvatarImage src={avatarPreview || avatarUrl || undefined} />
                <AvatarFallback className="text-3xl bg-blue-500 text-white">
                  {getInitials(fullName)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex gap-4 justify-center mb-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {t('profile.uploadPhoto')}
                </Button>
                {(avatarUrl || avatarPreview) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRemoveAvatar}
                    className="border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <X className="w-4 h-4 mr-2" />
                    {t('profile.removePhoto')}
                  </Button>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.avatarHint')}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                className="hidden"
              />
              
              {errors.avatar && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errors.avatar}</p>
              )}
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-6">
            {/* Full Name */}
            <div>
              <Label htmlFor="fullName" className="text-gray-900 dark:text-gray-100">
                {t('profile.fullName')}
              </Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('profile.fullNamePlaceholder')}
              className={errors.fullName ? 'border-red-500' : ''}
            />
            {errors.fullName && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errors.fullName}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <Label htmlFor="phone" className="text-gray-900 dark:text-gray-100">{t('profile.phone')}</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('profile.phonePlaceholder')}
              className={errors.phone ? 'border-red-500' : ''}
            />
            {errors.phone && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errors.phone}</p>
            )}
          </div>

          {/* City */}
          <div>
            <Label htmlFor="city" className="text-gray-900 dark:text-gray-100">{t('profile.city')}</Label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger className="text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <SelectValue placeholder={t('profile.selectCity')} />
              </SelectTrigger>
              <SelectContent>
                {cities.map((cityItem) => (
                  <SelectItem key={cityItem.id} value={cityItem.name}>
                    {cityItem.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target Group */}
          <div>
            <Label htmlFor="targetGroup" className="text-gray-900 dark:text-gray-100">{t('profile.targetGroup')}</Label>
            <Select value={targetGroup} onValueChange={(value) => setTargetGroup(value)}>
              <SelectTrigger className="text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <SelectValue placeholder={t('profile.selectTargetGroup')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="I qrup">I qrup</SelectItem>
                <SelectItem value="II qrup">II qrup</SelectItem>
                <SelectItem value="III qrup">III qrup</SelectItem>
                <SelectItem value="IV qrup">IV qrup</SelectItem>
                <SelectItem value="V qrup">V qrup</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Target University */}
          <div>
            <Label htmlFor="targetUniversity" className="text-gray-900 dark:text-gray-100">{t('profile.targetUniversity')}</Label>
            <Select value={targetUniversity} onValueChange={setTargetUniversity}>
              <SelectTrigger className="text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                <SelectValue placeholder={t('profile.selectUniversity')} />
              </SelectTrigger>
              <SelectContent>
                {universities.map((uni) => (
                  <SelectItem key={uni.id} value={uni.name}>
                    {uni.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bio */}
          <div>
            <Label htmlFor="bio" className="text-gray-900 dark:text-gray-100">{t('profile.bio')}</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('profile.bioPlaceholder')}
              className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
              rows={4}
              maxLength={500}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {bio.length}/500 {t('profile.characters')}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mt-8">
          <Button
            type="submit"
            disabled={saving}
            onClick={handleSave}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {t('profile.saveChanges')}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/student/profile')}
            disabled={saving}
            className="border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {t('common.cancel')}
          </Button>
        </div>
        </Card>
      </div>
    </div>
  )
}
