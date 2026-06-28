/**
 * Admin Notification Composer
 * Allows admins to compose and send custom notifications
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Send, Users, User, Clock, AlertCircle } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { DeepLinkPicker } from '@/components/notifications/DeepLinkPicker';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface Template {
  id: string;
  name: string;
  title: string;
  body: string;
  category: string;
  channels: string[];
  variables: string[];
}

// ============================================
// Supported Variables for Notifications
// ============================================
const SUPPORTED_VARIABLES = [
  { 
    name: '{{user_name}}', 
    description: 'Recipient\'s full name',
    example: 'Ali Mammadov'
  },
  { 
    name: '{{first_name}}', 
    description: 'Recipient\'s first name only',
    example: 'Ali'
  },
  { 
    name: '{{email}}', 
    description: 'Recipient\'s email (masked for privacy)',
    example: 'ali***@gmail.com'
  },
  { 
    name: '{{target_group}}', 
    description: 'Student\'s exam target group',
    example: 'I, II, III, IV, or V'
  },
  { 
    name: '{{city}}', 
    description: 'Student\'s city',
    example: 'Baku'
  },
  { 
    name: '{{date}}', 
    description: 'Current date when sent',
    example: '2025-12-29'
  },
  { 
    name: '{{time}}', 
    description: 'Current time when sent',
    example: '14:30'
  },
  { 
    name: '{{app_name}}', 
    description: 'Application name',
    example: 'Elmly'
  },
];

// ============================================
// Variable Helper Component
// ============================================
interface VariableHelperProps {
  title: string;
  body: string;
  includesTeachers: boolean; // True if teachers are in the recipient list
}

function VariableHelper({ title, body, includesTeachers }: VariableHelperProps) {
  const [showAllVariables, setShowAllVariables] = useState(false);
  
  // Detect variables used in title and body
  const combinedText = `${title} ${body}`;
  const usedVariables = SUPPORTED_VARIABLES.filter(v => 
    combinedText.includes(v.name)
  );
  
  // Check for unknown variables (anything matching {{...}} pattern not in our list)
  const variablePattern = /\{\{([^}]+)\}\}/g;
  const allMatches = combinedText.match(variablePattern) || [];
  const unknownVariables = allMatches.filter(match => 
    !SUPPORTED_VARIABLES.some(v => v.name === match)
  );
  
  // Check if {{target_group}} is used when teachers are included
  const hasTargetGroupWithTeachers = includesTeachers && combinedText.includes('{{target_group}}');

  return (
    <div className="space-y-3">
      {/* Used Variables Detection */}
      {usedVariables.length > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 text-blue-800 font-medium text-sm mb-2">
            <span>🔄</span>
            Variables Detected ({usedVariables.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {usedVariables.map(v => (
              <span 
                key={v.name}
                className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-mono"
                title={v.description}
              >
                {v.name} → {v.example}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Target Group Warning for Teachers */}
      {hasTargetGroupWithTeachers && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-800 font-medium text-sm mb-1">
            <span>🚫</span>
            Invalid Variable for Teachers
          </div>
          <p className="text-xs text-red-700">
            <code className="bg-red-100 px-1 rounded">{'{{target_group}}'}</code> is only available for students. 
            Teachers don't have a target group. This variable will be empty for teacher recipients.
          </p>
        </div>
      )}

      {/* Unknown Variables Warning */}
      {unknownVariables.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-800 font-medium text-sm mb-1">
            <span>⚠️</span>
            Unknown Variables
          </div>
          <p className="text-xs text-yellow-700">
            These variables won't be replaced: {unknownVariables.join(', ')}
          </p>
        </div>
      )}

      {/* Available Variables Reference */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAllVariables(!showAllVariables)}
          className="w-full px-3 py-2 bg-gray-50 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 flex items-center justify-between"
        >
          <span>📋 Available Variables</span>
          <span className="text-gray-400">{showAllVariables ? '▲' : '▼'}</span>
        </button>
        
        {showAllVariables && (
          <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
            {SUPPORTED_VARIABLES.map(v => (
              <div 
                key={v.name}
                className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                onClick={() => {
                  navigator.clipboard.writeText(v.name);
                }}
                title="Click to copy"
              >
                <code className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-mono whitespace-nowrap">
                  {v.name}
                </code>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700">{v.description}</p>
                  <p className="text-xs text-gray-500">Example: {v.example}</p>
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400 pt-2 border-t">
              💡 Click any variable to copy it to clipboard
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NotificationComposerPage() {
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [recipientType, setRecipientType] = useState<'all' | 'role' | 'individual'>('all');
  const [selectedRole, setSelectedRole] = useState<string>('student');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [notificationType, setNotificationType] = useState('general');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channels, setChannels] = useState<string[]>(['in_app']);
  const [scheduleFor, setScheduleFor] = useState<string>('');
  const [actionUrl, setActionUrl] = useState('');

  useEffect(() => {
    loadProfiles();
    loadTemplates();
  }, []);

  const loadProfiles = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, user_type')
        .order('full_name', { ascending: true });

      if (error) {
        console.error('Error fetching profiles:', error);
        return;
      }

      // Get emails from auth.users using database function
      const userIds = (data || []).map(p => p.id);
      const { data: emailData } = await supabase.rpc('admin_get_user_emails', {
        user_ids: userIds
      });
      const emailMap: Record<string, string> = emailData || {};

      // Map user_type to role for display and use real emails
      const profilesWithEmails = (data || []).map(profile => ({
        id: profile.id,
        full_name: profile.full_name,
        role: profile.user_type,
        email: emailMap[profile.id] || 'No email',
      }));

      setProfiles(profilesWithEmails);
    } catch (err) {
      console.error('Error loading profiles:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('notification_templates')
        .select('id, name, title, body, category, channels, variables')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching templates:', error);
        return;
      }

      setTemplates(data || []);
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    
    if (!templateId) {
      // Reset to defaults when "Start from scratch" is selected
      return;
    }

    const template = templates.find(t => t.id === templateId);
    if (template) {
      setTitle(template.title);
      setBody(template.body);
      setNotificationType(template.category);
      setChannels(template.channels || ['in_app']);
    }
  };

  const handleChannelToggle = (channel: string) => {
    setChannels(prev =>
      prev.includes(channel)
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    );
  };

  const handleUserToggle = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const getRecipientCount = () => {
    if (recipientType === 'all') return profiles.length;
    if (recipientType === 'role') {
      return profiles.filter(p => p.role === selectedRole).length;
    }
    return selectedUsers.length;
  };

  // Check if teachers are included in the recipient list
  const includesTeachers = (): boolean => {
    if (recipientType === 'all') {
      // All users includes teachers
      return profiles.some(p => p.role === 'teacher');
    }
    if (recipientType === 'role') {
      return selectedRole === 'teacher';
    }
    // Individual selection - check if any selected user is a teacher
    return selectedUsers.some(userId => {
      const profile = profiles.find(p => p.id === userId);
      return profile?.role === 'teacher';
    });
  };

  const handleSend = async () => {
    try {
      setSending(true);
      setError(null);
      setSuccess(false);

      // Validate
      if (!title.trim()) {
        setError('Title is required');
        return;
      }
      if (!body.trim()) {
        setError('Body is required');
        return;
      }
      if (channels.length === 0) {
        setError('Select at least one channel');
        return;
      }
      if (recipientType === 'individual' && selectedUsers.length === 0) {
        setError('Select at least one recipient');
        return;
      }

      // Determine recipients
      let recipients: string[] = [];
      if (recipientType === 'all') {
        recipients = profiles.map(p => p.id);
      } else if (recipientType === 'role') {
        recipients = profiles.filter(p => p.role === selectedRole).map(p => p.id);
      } else {
        recipients = selectedUsers;
      }

      // Send notification
      const response = await fetch('/api/notifications/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients,
          notificationType,
          title,
          body,
          channels,
          scheduledAt: scheduleFor || null,
          actionUrl: actionUrl || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send notification');
      }

      setSuccess(true);
      // Reset form
      setTitle('');
      setBody('');
      setActionUrl('');
      setScheduleFor('');
      setSelectedUsers([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/notifications">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Compose Notification</h1>
          <p className="text-gray-600 mt-1">
            Send custom notifications to users
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recipients */}
          <Card>
            <CardHeader>
              <CardTitle>Recipients</CardTitle>
              <CardDescription>Who should receive this notification?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Recipient Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Recipient Type</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setRecipientType('all')}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      recipientType === 'all'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Users className="h-5 w-5 mx-auto mb-1" />
                    <div className="text-sm font-medium">All Users</div>
                  </button>
                  <button
                    onClick={() => setRecipientType('role')}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      recipientType === 'role'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Users className="h-5 w-5 mx-auto mb-1" />
                    <div className="text-sm font-medium">By Role</div>
                  </button>
                  <button
                    onClick={() => setRecipientType('individual')}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      recipientType === 'individual'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <User className="h-5 w-5 mx-auto mb-1" />
                    <div className="text-sm font-medium">Individual</div>
                  </button>
                </div>
              </div>

              {/* Role Selection */}
              {recipientType === 'role' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Role</label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="w-full p-2 border rounded-lg"
                  >
                    <option value="student">Students</option>
                    <option value="teacher">Teachers</option>
                    <option value="admin">Admins</option>
                  </select>
                </div>
              )}

              {/* Individual Selection */}
              {recipientType === 'individual' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Users</label>
                  <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                    {profiles.map(profile => (
                      <label key={profile.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(profile.id)}
                          onChange={() => handleUserToggle(profile.id)}
                          className="rounded"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm">{profile.full_name}</div>
                          <div className="text-xs text-gray-500">{profile.email}</div>
                        </div>
                        <span className="text-xs text-gray-400 uppercase">{profile.role}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Content */}
          <Card>
            <CardHeader>
              <CardTitle>Content</CardTitle>
              <CardDescription>Notification message</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Template Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Use Template (Optional)</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="">Start from scratch...</option>
                  {templates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.category})
                    </option>
                  ))}
                </select>
                {templates.length === 0 && (
                  <p className="text-xs text-gray-500">
                    No templates available. <a href="/notifications/templates" className="text-blue-600 hover:underline">Create one</a>
                  </p>
                )}
              </div>

              {/* Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <select
                  value={notificationType}
                  onChange={(e) => setNotificationType(e.target.value)}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="general">General</option>
                  <option value="exam">Exam</option>
                  <option value="booking">Booking</option>
                  <option value="achievement">Achievement</option>
                  <option value="reminder">Reminder</option>
                  <option value="announcement">Announcement</option>
                </select>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter notification title"
                  className="w-full p-2 border rounded-lg"
                  maxLength={100}
                />
                <div className="text-xs text-gray-500 text-right">{title.length}/100</div>
              </div>

              {/* Body */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Body *</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Enter notification message"
                  className="w-full p-2 border rounded-lg min-h-[120px]"
                  maxLength={500}
                />
                <div className="text-xs text-gray-500 text-right">{body.length}/500</div>
              </div>

              {/* Variable Detection */}
              <VariableHelper title={title} body={body} includesTeachers={includesTeachers()} />

              {/* Action URL with Deep Link Picker */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Action URL (Optional)</label>
                <DeepLinkPicker
                  value={actionUrl}
                  onChange={setActionUrl}
                />
              </div>
            </CardContent>
          </Card>

          {/* Delivery Options */}
          <Card>
            <CardHeader>
              <CardTitle>Delivery Options</CardTitle>
              <CardDescription>How and when to send</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Channels */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Channels *</label>
                <div className="grid grid-cols-2 gap-2">
                  {['in_app', 'push', 'email', 'sms'].map(channel => (
                    <label key={channel} className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={channels.includes(channel)}
                        onChange={() => handleChannelToggle(channel)}
                        className="rounded"
                      />
                      <span className="text-sm capitalize">{channel.replace('_', '-')}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Schedule */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Schedule (Optional)</label>
                <input
                  type="datetime-local"
                  value={scheduleFor}
                  onChange={(e) => setScheduleFor(e.target.value)}
                  className="w-full p-2 border rounded-lg"
                />
                <p className="text-xs text-gray-500">Leave empty to send immediately</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview & Actions */}
        <div className="space-y-6">
          {/* Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Stats */}
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-sm text-gray-600">Recipients</div>
                  <div className="text-2xl font-bold text-blue-600">{getRecipientCount()}</div>
                </div>

                {/* Notification Preview */}
                <div className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-600 text-sm font-bold">U</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">
                        {title || 'Notification Title'}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {body || 'Notification body will appear here...'}
                      </div>
                      <div className="text-xs text-gray-400 mt-2">Just now</div>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Type:</span>
                    <span className="font-medium capitalize">{notificationType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Channels:</span>
                    <span className="font-medium">{channels.length}</span>
                  </div>
                  {scheduleFor && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Scheduled:</span>
                      <span className="font-medium text-xs">
                        {new Date(scheduleFor).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Send Button - Moved inside Preview card for better UX */}
                <Button
                  onClick={handleSend}
                  disabled={sending || !title || !body || channels.length === 0}
                  className="w-full"
                  size="lg"
                >
                  {sending ? (
                    <>
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      {scheduleFor ? 'Schedule Notification' : 'Send Now'}
                    </>
                  )}
                </Button>

                {success && (
                  <div className="p-3 bg-green-50 text-green-800 rounded-lg text-sm">
                    ✅ Notification sent successfully!
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-red-50 text-red-800 rounded-lg text-sm flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
