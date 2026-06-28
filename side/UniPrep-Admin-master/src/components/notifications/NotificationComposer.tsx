'use client';

import { useState, useEffect } from 'react';
import { 
  adminNotificationService, 
  NotificationTarget, 
  NotificationChannels,
  NotificationTemplate,
  CreateNotificationParams 
} from '@/services/adminNotificationService';
import { auditLogService, AuditActionTypes } from '@/services/auditLogService';
import TargetSelector from './TargetSelector';

interface NotificationComposerProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function NotificationComposer({ onSuccess, onCancel }: NotificationComposerProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channels, setChannels] = useState<NotificationChannels>({
    in_app: true,
    push: false,
    email: false
  });
  const [target, setTarget] = useState<NotificationTarget>({ type: 'all' });
  const [targetCount, setTargetCount] = useState(0);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await adminNotificationService.getTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setTitle(template.title);
      setBody(template.body);
      setChannels({
        in_app: template.channels.includes('in_app'),
        push: template.channels.includes('push'),
        email: template.channels.includes('email')
      });
    }
  };

  const handleChannelToggle = (channel: keyof NotificationChannels) => {
    setChannels(prev => ({ ...prev, [channel]: !prev[channel] }));
  };

  const getScheduledAt = (): Date | null => {
    if (!scheduleEnabled || !scheduledDate || !scheduledTime) return null;
    return new Date(`${scheduledDate}T${scheduledTime}`);
  };

  const handleSend = async () => {
    setError(null);

    // Validation
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!body.trim()) {
      setError('Message body is required');
      return;
    }
    if (!channels.in_app && !channels.push && !channels.email) {
      setError('At least one channel must be selected');
      return;
    }
    if (targetCount === 0) {
      setError('No recipients match the selected criteria');
      return;
    }

    setSending(true);
    try {
      const params: CreateNotificationParams = {
        title: title.trim(),
        body: body.trim(),
        channels,
        target,
        scheduledAt: getScheduledAt()
      };

      const result = await adminNotificationService.sendNotification(params);
      
      // Log the notification send action
      await auditLogService.logAction({
        actionType: AuditActionTypes.NOTIFICATION_SEND,
        tableName: 'notifications',
        description: `Sent notification: ${title.trim()}`,
        metadata: {
          title: title.trim(),
          channels,
          target_type: target.type,
          recipient_count: targetCount,
          scheduled: !!params.scheduledAt
        }
      });
      
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        📤 Send Notification
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Template Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Use Template (Optional)
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Start from scratch...</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.category})
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notification title..."
            maxLength={100}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">{title.length}/100 characters</p>
        </div>

        {/* Body */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Message *
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message here..."
            rows={4}
            maxLength={500}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
          <p className="mt-1 text-xs text-gray-500">{body.length}/500 characters</p>
        </div>

        {/* Channels */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Channels *
          </label>
          <div className="flex flex-wrap gap-3">
            {[
              { key: 'in_app', label: 'In-App', icon: '📱', description: 'Notification center' },
              { key: 'push', label: 'Push', icon: '🔔', description: 'Device notification' },
              { key: 'email', label: 'Email', icon: '📧', description: 'Email message' },
            ].map((channel) => (
              <button
                key={channel.key}
                type="button"
                onClick={() => handleChannelToggle(channel.key as keyof NotificationChannels)}
                className={`
                  flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all
                  ${channels[channel.key as keyof NotificationChannels]
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }
                `}
              >
                <span className="text-xl">{channel.icon}</span>
                <div className="text-left">
                  <p className="font-medium">{channel.label}</p>
                  <p className="text-xs opacity-75">{channel.description}</p>
                </div>
                {channels[channel.key as keyof NotificationChannels] && (
                  <span className="ml-2 text-blue-500">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Target Selection */}
        <TargetSelector
          value={target}
          onChange={setTarget}
          onCountChange={setTargetCount}
        />

        {/* Schedule */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="schedule"
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="schedule" className="text-sm font-medium text-gray-700">
              Schedule for later
            </label>
          </div>
          
          {scheduleEnabled && (
            <div className="flex gap-3 mt-2">
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
            <p className="font-semibold text-gray-900">{title || 'Notification Title'}</p>
            <p className="text-sm text-gray-600 mt-1">{body || 'Your message will appear here...'}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || targetCount === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {sending ? (
              <>
                <span className="animate-spin">⏳</span>
                Sending...
              </>
            ) : scheduleEnabled ? (
              <>
                <span>📅</span>
                Schedule ({targetCount} recipients)
              </>
            ) : (
              <>
                <span>📤</span>
                Send Now ({targetCount} recipients)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
