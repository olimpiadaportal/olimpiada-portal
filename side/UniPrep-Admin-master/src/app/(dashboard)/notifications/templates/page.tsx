/**
 * Template Management Page
 * Create and manage notification templates
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Edit, Trash2, Copy, Eye } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  type: string;
  title: string;
  body: string;
  channels: string[];
  variables: string[];
  created_at: string;
  usage_count: number;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'general',
    title: '',
    body: '',
    channels: ['in_app'] as string[],
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/notifications/templates');
      if (!response.ok) throw new Error('Failed to load templates');
      const data = await response.json();
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const url = editingTemplate
        ? `/api/notifications/templates/${editingTemplate.id}`
        : '/api/notifications/templates';
      
      
      const response = await fetch(url, {
        method: editingTemplate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('Save failed:', responseData);
        throw new Error(responseData.error || 'Failed to save template');
      }

      await loadTemplates();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const response = await fetch(`/api/notifications/templates/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete template');

      await loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template');
    }
  };

  const handleDuplicate = (template: Template) => {
    setFormData({
      name: `${template.name} (Copy)`,
      type: template.type,
      title: template.title,
      body: template.body,
      channels: template.channels,
    });
    setEditingTemplate(null);
    setShowModal(true);
  };

  const handleEdit = (template: Template) => {
    setFormData({
      name: template.name,
      type: template.type,
      title: template.title,
      body: template.body,
      channels: template.channels,
    });
    setEditingTemplate(template);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'general',
      title: '',
      body: '',
      channels: ['in_app'],
    });
    setEditingTemplate(null);
  };

  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\{\{(\w+)\}\}/g);
    return matches ? [...new Set(matches.map(m => m.slice(2, -2)))] : [];
  };

  const allVariables = [
    ...extractVariables(formData.title),
    ...extractVariables(formData.body),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/notifications">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Notification Templates</h1>
            <p className="text-gray-600 mt-1">
              Create reusable templates for common notifications
            </p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Loading templates...</p>
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-600 mb-4">No templates yet</p>
            <Button onClick={() => { resetForm(); setShowModal(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <CardDescription className="capitalize">{template.type}</CardDescription>
                  </div>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    Used {template.usage_count || 0}x
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{template.title}</p>
                    <p className="text-sm text-gray-600 line-clamp-2 mt-1">{template.body}</p>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {template.channels.map((channel) => (
                      <span
                        key={channel}
                        className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded"
                      >
                        {channel}
                      </span>
                    ))}
                  </div>

                  {template.variables && template.variables.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {template.variables.map((variable) => (
                        <span
                          key={variable}
                          className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded font-mono"
                        >
                          {`{{${variable}}}`}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(template)}
                      className="flex-1"
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDuplicate(template)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(template.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4">
                {editingTemplate ? 'Edit Template' : 'New Template'}
              </h2>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium mb-1">Template Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Welcome Message"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
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
                <div>
                  <label className="block text-sm font-medium mb-1">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Use {{variable}} for dynamic content"
                    className="w-full p-2 border rounded-lg"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Example: Welcome {'{{'} userName {'}}'}!
                  </p>
                </div>

                {/* Body */}
                <div>
                  <label className="block text-sm font-medium mb-1">Body *</label>
                  <textarea
                    value={formData.body}
                    onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                    placeholder="Use {{variable}} for dynamic content"
                    className="w-full p-2 border rounded-lg min-h-[100px]"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Example: Your exam {'{{'} examName {'}}'}  is scheduled for {'{{'} examDate {'}}'}
                  </p>
                </div>

                {/* Variables Detected */}
                {allVariables.length > 0 && (
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <p className="text-sm font-medium text-purple-900 mb-2">
                      Variables detected:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {allVariables.map((variable) => (
                        <span
                          key={variable}
                          className="text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded font-mono"
                        >
                          {'{{'}
                          {variable}
                          {'}}'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Channels */}
                <div>
                  <label className="block text-sm font-medium mb-1">Channels</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['in_app', 'push', 'email', 'sms'].map((channel) => (
                      <label key={channel} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={formData.channels.includes(channel)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                channels: [...formData.channels, channel],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                channels: formData.channels.filter((c) => c !== channel),
                              });
                            }
                          }}
                        />
                        <span className="text-sm capitalize">{channel.replace('_', '-')}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleSave}
                    disabled={!formData.name || !formData.title || !formData.body}
                    className="flex-1"
                  >
                    {editingTemplate ? 'Update Template' : 'Create Template'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
