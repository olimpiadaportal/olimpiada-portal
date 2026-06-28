'use client';

import { useState, useEffect } from 'react';
import { Question, QuestionDifficulty, QuestionType, Subject, GradingRubric, RubricCriterion, QuestionGroup } from '@/types/questions';
import { questionService } from '@/services/questionService';
import { questionGroupService } from '@/services/questionGroupService';
import { topicService } from '@/services/topicService';
import { subtopicService } from '@/services/subtopicService';
import { useToast } from '@/contexts/ToastContext';
import type { TopicWithStats } from '@/types/subjects';
import type { SubtopicWithStats } from '@/types/subjects';
import { supabase } from '@/lib/supabase';

interface AddQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  subjects: Subject[];
  preSelectedSubjectId?: string;
}

export default function AddQuestionModal({
  isOpen,
  onClose,
  onSuccess,
  subjects,
  preSelectedSubjectId,
}: AddQuestionModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [topics, setTopics] = useState<TopicWithStats[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [subtopics, setSubtopics] = useState<SubtopicWithStats[]>([]);
  const [loadingSubtopics, setLoadingSubtopics] = useState(false);
  const [subtopicId, setSubtopicId] = useState('');
  const [showCreateTopic, setShowCreateTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicDescription, setNewTopicDescription] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [useImageUpload, setUseImageUpload] = useState(false);
  const [createMode, setCreateMode] = useState<'single' | 'group'>('single'); // single question or question group

  const [formData, setFormData] = useState({
    subject_id: preSelectedSubjectId || '',
    topic: '',
    question_type: 'mcq' as QuestionType,
    question_text: '',
    question_image_url: '',
    // MCQ fields
    option_a: '',
    option_b: '',
    option_c: '',
    option_d: '',
    option_e: '',
    correct_answer: 'A' as 'A' | 'B' | 'C' | 'D' | 'E',
    // Open question fields
    expected_answer: '',
    answer_keywords: '',
    max_points: 1,
    sample_answer: '',
    // Common fields
    explanation: '',
    difficulty: 'medium' as QuestionDifficulty,
    tags: '',
    source: '',
    year: new Date().getFullYear(),
  });
  
  // For written_open question groups (Situasiya)
  const [contextText, setContextText] = useState('');
  const [contextImageUrl, setContextImageUrl] = useState('');
  const [question1, setQuestion1] = useState({ text: '', rubric: [] as RubricCriterion[], correctAnswer: '' });
  const [question2, setQuestion2] = useState({ text: '', rubric: [] as RubricCriterion[], correctAnswer: '' });
  const [question3, setQuestion3] = useState({ text: '', rubric: [] as RubricCriterion[], correctAnswer: '' });
  
  const [rubricCriteria, setRubricCriteria] = useState<RubricCriterion[]>([]);

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setFormData({
        subject_id: preSelectedSubjectId || '',
        topic: '',
        question_type: 'mcq',
        question_text: '',
        question_image_url: '',
        option_a: '',
        option_b: '',
        option_c: '',
        option_d: '',
        option_e: '',
        correct_answer: 'A',
        expected_answer: '',
        answer_keywords: '',
        max_points: 1,
        sample_answer: '',
        explanation: '',
        difficulty: 'medium',
        tags: '',
        source: '',
        year: new Date().getFullYear(),
      });
      setRubricCriteria([]);
      setContextText('');
      setContextImageUrl('');
      setQuestion1({ text: '', rubric: [], correctAnswer: '' });
      setQuestion2({ text: '', rubric: [], correctAnswer: '' });
      setQuestion3({ text: '', rubric: [], correctAnswer: '' });
      setShowCreateTopic(false);
      setNewTopicName('');
      setNewTopicDescription('');
      setSubtopics([]);
      setSubtopicId('');
      setImagePreview(null);
      setUseImageUpload(false);
    }
  }, [isOpen, preSelectedSubjectId]);

  useEffect(() => {
    if (formData.subject_id) {
      loadTopics();
    } else {
      setTopics([]);
    }
  }, [formData.subject_id]);

  const loadTopics = async () => {
    if (!formData.subject_id) return;

    setLoadingTopics(true);
    try {
      const result = await topicService.getTopicsBySubject(formData.subject_id);
      if (result.success && result.data) {
        setTopics(result.data);
      }
    } catch (error) {
      console.error('Failed to load topics:', error);
    } finally {
      setLoadingTopics(false);
    }
  };

  const loadSubtopicsForTopic = async (topicId: string) => {
    setLoadingSubtopics(true);
    setSubtopicId('');
    try {
      const result = await subtopicService.getSubtopicsByTopic(topicId);
      if (result.success && result.data) {
        setSubtopics(result.data.filter((s) => s.is_active));
      } else {
        setSubtopics([]);
      }
    } catch {
      setSubtopics([]);
    } finally {
      setLoadingSubtopics(false);
    }
  };

  // Load subtopics when topic selection changes
  useEffect(() => {
    if (formData.topic) {
      const topic = topics.find((t) => t.topic_name === formData.topic);
      if (topic) {
        loadSubtopicsForTopic(topic.id);
      } else {
        setSubtopics([]);
        setSubtopicId('');
      }
    } else {
      setSubtopics([]);
      setSubtopicId('');
    }
  }, [formData.topic, topics]);

  const handleCreateTopic = async () => {
    if (!newTopicName.trim()) {
      toast.error('Topic name is required');
      return;
    }

    if (!formData.subject_id) {
      toast.error('Please select a subject first');
      return;
    }

    setCreatingTopic(true);
    try {
      const result = await topicService.createTopic({
        subject_id: formData.subject_id,
        topic_name: newTopicName.trim(),
        description: newTopicDescription.trim() || undefined,
        display_order: 0, // Auto-assign order
      });

      if (result.success && result.data) {
        toast.success('Topic created successfully');
        // result.data is the topic ID (string), use newTopicName for the topic field
        setFormData({ ...formData, topic: newTopicName.trim() });
        setShowCreateTopic(false);
        setNewTopicName('');
        setNewTopicDescription('');
        await loadTopics(); // Reload topics
      } else {
        toast.error(result.error || 'Failed to create topic');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create topic');
    } finally {
      setCreatingTopic(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a valid image file');
      return;
    }

    setUploadingImage(true);
    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = fileName;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('question-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('question-images')
        .getPublicUrl(filePath);

      // Update form data with the public URL
      setFormData({ ...formData, question_image_url: publicUrl });
      setImagePreview(publicUrl);
      toast.success('Image uploaded successfully');
    } catch (error: any) {
      console.error('Image upload error:', error);
      toast.error(error.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.subject_id) {
      toast.error('Please select a subject');
      return;
    }

    // Question Group Mode Validation
    if (createMode === 'group') {
      if (!contextText.trim()) {
        toast.error('Situasiya (context text) is required');
        return;
      }
      if (!question1.text.trim() || !question2.text.trim() || !question3.text.trim()) {
        toast.error('All 3 questions are required');
        return;
      }
      if (question1.rubric.length === 0 || question2.rubric.length === 0 || question3.rubric.length === 0) {
        toast.error('Each question must have at least one rubric criterion');
        return;
      }

      setLoading(true);
      try {
        const result = await questionGroupService.createQuestionGroup({
          subject_id: formData.subject_id,
          topic: formData.topic || undefined,
          context_text: contextText.trim(),
          context_image_url: contextImageUrl.trim() || undefined,
          difficulty: formData.difficulty,
          tags: formData.tags.trim() ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
          source: formData.source.trim() || undefined,
          year: formData.year || undefined,
          questions: [
            {
              question_text: question1.text.trim(),
              expected_answer: question1.correctAnswer.trim() || undefined,
              grading_rubric: {
                criteria: question1.rubric,
                total_points: question1.rubric.reduce((sum, c) => sum + c.max_points, 0),
              },
              max_points: question1.rubric.reduce((sum, c) => sum + c.max_points, 0),
            },
            {
              question_text: question2.text.trim(),
              expected_answer: question2.correctAnswer.trim() || undefined,
              grading_rubric: {
                criteria: question2.rubric,
                total_points: question2.rubric.reduce((sum, c) => sum + c.max_points, 0),
              },
              max_points: question2.rubric.reduce((sum, c) => sum + c.max_points, 0),
            },
            {
              question_text: question3.text.trim(),
              expected_answer: question3.correctAnswer.trim() || undefined,
              grading_rubric: {
                criteria: question3.rubric,
                total_points: question3.rubric.reduce((sum, c) => sum + c.max_points, 0),
              },
              max_points: question3.rubric.reduce((sum, c) => sum + c.max_points, 0),
            },
          ],
        });

        if (result.success) {
          toast.success('Question group created successfully');
          onSuccess();
          onClose();
        } else {
          toast.error(result.error || 'Failed to create question group');
        }
      } catch (error: any) {
        toast.error(error.message || 'Failed to create question group');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Single Question Mode Validation
    if (!formData.question_text.trim()) {
      toast.error('Question text is required');
      return;
    }

    // Type-specific validation
    if (formData.question_type === 'mcq') {
      if (!formData.option_a.trim() || !formData.option_b.trim() || 
          !formData.option_c.trim() || !formData.option_d.trim() || 
          !formData.option_e.trim()) {
        toast.error('All 5 options (A-E) are required for MCQ questions');
        return;
      }
    } else if (formData.question_type === 'codable_open') {
      if (!formData.expected_answer.trim()) {
        toast.error('Correct answer is required for codable open questions');
        return;
      }
    }

    setLoading(true);
    try {
      const questionData: Partial<Question> = {
        subject_id: formData.subject_id,
        topic: formData.topic || undefined,
        subtopic_id: subtopicId || undefined,
        question_type: formData.question_type,
        question_text: formData.question_text.trim(),
        question_image_url: formData.question_image_url.trim() || undefined,
        explanation: formData.explanation.trim() || undefined,
        difficulty: formData.difficulty,
        tags: formData.tags.trim() ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        source: formData.source.trim() || undefined,
        year: formData.year || undefined,
        is_active: true,
        max_points: formData.max_points,
        exclude_from_practice: false,
      };

      // Add MCQ-specific fields
      if (formData.question_type === 'mcq') {
        questionData.option_a = formData.option_a.trim();
        questionData.option_b = formData.option_b.trim();
        questionData.option_c = formData.option_c.trim();
        questionData.option_d = formData.option_d.trim();
        questionData.option_e = formData.option_e.trim();
        questionData.correct_answer = formData.correct_answer;
      }

      // Add codable open fields - uses correct_answer for exact matching (like MCQ)
      if (formData.question_type === 'codable_open') {
        questionData.correct_answer = formData.expected_answer.trim(); // Store in correct_answer field
        questionData.answer_keywords = formData.answer_keywords.trim() 
          ? formData.answer_keywords.split(',').map(k => k.trim()).filter(Boolean)
          : undefined;
        questionData.sample_answer = formData.sample_answer.trim() || undefined;
      }

      // Add written open fields
      if (formData.question_type === 'written_open') {
        const totalPoints = rubricCriteria.reduce((sum, c) => sum + c.max_points, 0);
        questionData.grading_rubric = {
          criteria: rubricCriteria,
          total_points: totalPoints,
        };
        questionData.max_points = totalPoints;
        questionData.sample_answer = formData.sample_answer.trim() || undefined;
      }

      const result = await questionService.createQuestion(questionData);

      if (result.success) {
        toast.success('Question created successfully');
        onSuccess();
        onClose();
      } else {
        toast.error(result.error || 'Failed to create question');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create question');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const selectedSubject = subjects.find(s => s.id === formData.subject_id);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Add New Question</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Subject Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subject <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.subject_id}
              onChange={(e) => setFormData({ ...formData, subject_id: e.target.value, topic: '' })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">Select a subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name_en} ({subject.name_az})
                </option>
              ))}
            </select>
            {selectedSubject && (
              <p className="mt-1 text-sm text-gray-500">
                Category: {selectedSubject.category}
              </p>
            )}
          </div>

          {/* Topic Selection with Create Option */}
          {formData.subject_id && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Topic (Optional)
                </label>
                <button
                  type="button"
                  onClick={() => setShowCreateTopic(!showCreateTopic)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {showCreateTopic ? '← Back to Select' : '+ Create New Topic'}
                </button>
              </div>

              {showCreateTopic ? (
                <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      New Topic Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.target.value)}
                      placeholder="e.g., Algebra, Mechanics, Grammar"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description (Optional)
                    </label>
                    <textarea
                      value={newTopicDescription}
                      onChange={(e) => setNewTopicDescription(e.target.value)}
                      placeholder="Brief description of this topic"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateTopic}
                    disabled={creatingTopic || !newTopicName.trim()}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creatingTopic ? 'Creating...' : 'Create Topic'}
                  </button>
                </div>
              ) : (
                <select
                  value={formData.topic}
                  onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loadingTopics}
                >
                  <option value="">No topic (general question)</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.topic_name}>
                      {topic.topic_name} ({topic.question_count} questions)
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Subtopic Selection — shown when the selected topic has active subtopics */}
          {formData.subject_id && formData.topic && !showCreateTopic && subtopics.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subtopic <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <select
                value={subtopicId}
                onChange={(e) => setSubtopicId(e.target.value)}
                className="w-full px-4 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={loadingSubtopics}
              >
                <option value="">No subtopic</option>
                {subtopics.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subtopic_name}{s.difficulty_level ? ` — ${s.difficulty_level}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Create Mode Toggle - Single Question vs Question Group */}
          <div className="border-2 border-blue-200 bg-blue-50 rounded-lg p-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              What would you like to create?
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setCreateMode('single');
                  setFormData({ ...formData, question_type: 'mcq' });
                }}
                className={`p-4 border-2 rounded-lg text-center transition-all ${
                  createMode === 'single'
                    ? 'border-blue-600 bg-white shadow-md'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                <div className="text-3xl mb-2">📝</div>
                <div className="font-semibold text-gray-900">Single Question</div>
                <div className="text-xs text-gray-500 mt-1">MCQ, Short Answer, or Question Group</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCreateMode('group');
                  setFormData({ ...formData, question_type: 'written_open' });
                }}
                className={`p-4 border-2 rounded-lg text-center transition-all ${
                  createMode === 'group'
                    ? 'border-purple-600 bg-white shadow-md'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                <div className="text-3xl mb-2">📚</div>
                <div className="font-semibold text-gray-900">Question Group (Situasiya)</div>
                <div className="text-xs text-gray-500 mt-1">1 context + 3 questions</div>
              </button>
            </div>
          </div>

          {/* Question Type Selector - Only for Single Mode */}
          {createMode === 'single' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Question Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-4">
              {/* MCQ Card */}
              <button
                type="button"
                onClick={() => setFormData({ ...formData, question_type: 'mcq', max_points: 1 })}
                className={`p-4 border-2 rounded-lg text-center transition-all ${
                  formData.question_type === 'mcq'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="text-3xl mb-2">📝</div>
                <div className="font-semibold text-gray-900">Multiple Choice</div>
                <div className="text-xs text-gray-500 mt-1">5 options (A-E)</div>
              </button>

              {/* Codable Open Card */}
              <button
                type="button"
                onClick={() => setFormData({ ...formData, question_type: 'codable_open', max_points: 1 })}
                className={`p-4 border-2 rounded-lg text-center transition-all ${
                  formData.question_type === 'codable_open'
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="text-3xl mb-2">✏️</div>
                <div className="font-semibold text-gray-900">Short Answer</div>
                <div className="text-xs text-gray-500 mt-1">Auto-gradable</div>
              </button>
              </div>
              <p className="mt-2 text-sm text-purple-600">
                💡 For Question Group (written) questions, use <strong>Question Group (Situasiya)</strong> mode above
              </p>
            </div>
          )}

          {/* Question Group Mode - Situasiya */}
          {createMode === 'group' && (
            <div className="space-y-6">
              {/* Situasiya (Context) */}
              <div className="border-2 border-purple-200 bg-purple-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  📖 Situasiya (Shared Context) <span className="text-red-500">*</span>
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Enter the context text that all 3 questions will refer to (e.g., a passage, scenario, or case study)
                </p>
                <textarea
                  value={contextText}
                  onChange={(e) => setContextText(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="Enter the shared context/scenario here..."
                  required
                />
                
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Context Image (Optional)
                  </label>
                  <input
                    type="url"
                    value={contextImageUrl}
                    onChange={(e) => setContextImageUrl(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="https://example.com/context-image.jpg"
                  />
                </div>

                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Difficulty <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.difficulty}
                    onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as QuestionDifficulty })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    required
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              {/* Question 1 */}
              <div className="border-2 border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Sual 1 <span className="text-red-500">*</span>
                </h3>
                <textarea
                  value={question1.text}
                  onChange={(e) => setQuestion1({ ...question1, text: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-3"
                  placeholder="Enter first question..."
                  required
                />
                
                {/* Correct Answer for AI Grading */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Correct Answer (for AI grading)
                  </label>
                  <textarea
                    value={question1.correctAnswer}
                    onChange={(e) => setQuestion1({ ...question1, correctAnswer: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="Enter the expected correct answer for AI to compare against..."
                  />
                  <p className="text-xs text-gray-500 mt-1">AI will use this to evaluate student answers</p>
                </div>
                
                <div className="bg-purple-50 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-gray-700">Grading Rubric</label>
                    <button
                      type="button"
                      onClick={() => {
                        const newCriterion = {
                          id: Date.now().toString(),
                          name: '',
                          description: '',
                          max_points: 1,
                        };
                        setQuestion1({ ...question1, rubric: [...question1.rubric, newCriterion] });
                      }}
                      className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
                    >
                      + Add Criterion
                    </button>
                  </div>
                  {question1.rubric.map((criterion, idx) => (
                    <div key={criterion.id} className="bg-white rounded p-2 mb-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-gray-600">Criterion {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => setQuestion1({ ...question1, rubric: question1.rubric.filter(c => c.id !== criterion.id) })}
                          className="text-red-600 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        type="text"
                        value={criterion.name}
                        onChange={(e) => {
                          const updated = question1.rubric.map(c => 
                            c.id === criterion.id ? { ...c, name: e.target.value } : c
                          );
                          setQuestion1({ ...question1, rubric: updated });
                        }}
                        placeholder="Criterion name"
                        className="w-full px-2 py-1 text-sm border rounded mb-1"
                      />
                      <input
                        type="number"
                        value={criterion.max_points}
                        onChange={(e) => {
                          const updated = question1.rubric.map(c => 
                            c.id === criterion.id ? { ...c, max_points: parseInt(e.target.value) || 1 } : c
                          );
                          setQuestion1({ ...question1, rubric: updated });
                        }}
                        placeholder="Points"
                        min="1"
                        max="10"
                        className="w-20 px-2 py-1 text-sm border rounded"
                      />
                    </div>
                  ))}
                  <p className="text-xs text-gray-600 mt-2">
                    Total: {question1.rubric.reduce((sum, c) => sum + c.max_points, 0)} points
                  </p>
                </div>
              </div>

              {/* Question 2 */}
              <div className="border-2 border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Sual 2 <span className="text-red-500">*</span>
                </h3>
                <textarea
                  value={question2.text}
                  onChange={(e) => setQuestion2({ ...question2, text: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-3"
                  placeholder="Enter second question..."
                  required
                />
                
                {/* Correct Answer for AI Grading */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Correct Answer (for AI grading)
                  </label>
                  <textarea
                    value={question2.correctAnswer}
                    onChange={(e) => setQuestion2({ ...question2, correctAnswer: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="Enter the expected correct answer for AI to compare against..."
                  />
                  <p className="text-xs text-gray-500 mt-1">AI will use this to evaluate student answers</p>
                </div>
                
                <div className="bg-purple-50 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-gray-700">Grading Rubric</label>
                    <button
                      type="button"
                      onClick={() => {
                        const newCriterion = {
                          id: Date.now().toString(),
                          name: '',
                          description: '',
                          max_points: 1,
                        };
                        setQuestion2({ ...question2, rubric: [...question2.rubric, newCriterion] });
                      }}
                      className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
                    >
                      + Add Criterion
                    </button>
                  </div>
                  {question2.rubric.map((criterion, idx) => (
                    <div key={criterion.id} className="bg-white rounded p-2 mb-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-gray-600">Criterion {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => setQuestion2({ ...question2, rubric: question2.rubric.filter(c => c.id !== criterion.id) })}
                          className="text-red-600 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        type="text"
                        value={criterion.name}
                        onChange={(e) => {
                          const updated = question2.rubric.map(c => 
                            c.id === criterion.id ? { ...c, name: e.target.value } : c
                          );
                          setQuestion2({ ...question2, rubric: updated });
                        }}
                        placeholder="Criterion name"
                        className="w-full px-2 py-1 text-sm border rounded mb-1"
                      />
                      <input
                        type="number"
                        value={criterion.max_points}
                        onChange={(e) => {
                          const updated = question2.rubric.map(c => 
                            c.id === criterion.id ? { ...c, max_points: parseInt(e.target.value) || 1 } : c
                          );
                          setQuestion2({ ...question2, rubric: updated });
                        }}
                        placeholder="Points"
                        min="1"
                        max="10"
                        className="w-20 px-2 py-1 text-sm border rounded"
                      />
                    </div>
                  ))}
                  <p className="text-xs text-gray-600 mt-2">
                    Total: {question2.rubric.reduce((sum, c) => sum + c.max_points, 0)} points
                  </p>
                </div>
              </div>

              {/* Question 3 */}
              <div className="border-2 border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Sual 3 <span className="text-red-500">*</span>
                </h3>
                <textarea
                  value={question3.text}
                  onChange={(e) => setQuestion3({ ...question3, text: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-3"
                  placeholder="Enter third question..."
                  required
                />
                
                {/* Correct Answer for AI Grading */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Correct Answer (for AI grading)
                  </label>
                  <textarea
                    value={question3.correctAnswer}
                    onChange={(e) => setQuestion3({ ...question3, correctAnswer: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="Enter the expected correct answer for AI to compare against..."
                  />
                  <p className="text-xs text-gray-500 mt-1">AI will use this to evaluate student answers</p>
                </div>
                
                <div className="bg-purple-50 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-gray-700">Grading Rubric</label>
                    <button
                      type="button"
                      onClick={() => {
                        const newCriterion = {
                          id: Date.now().toString(),
                          name: '',
                          description: '',
                          max_points: 1,
                        };
                        setQuestion3({ ...question3, rubric: [...question3.rubric, newCriterion] });
                      }}
                      className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
                    >
                      + Add Criterion
                    </button>
                  </div>
                  {question3.rubric.map((criterion, idx) => (
                    <div key={criterion.id} className="bg-white rounded p-2 mb-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-gray-600">Criterion {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => setQuestion3({ ...question3, rubric: question3.rubric.filter(c => c.id !== criterion.id) })}
                          className="text-red-600 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        type="text"
                        value={criterion.name}
                        onChange={(e) => {
                          const updated = question3.rubric.map(c => 
                            c.id === criterion.id ? { ...c, name: e.target.value } : c
                          );
                          setQuestion3({ ...question3, rubric: updated });
                        }}
                        placeholder="Criterion name"
                        className="w-full px-2 py-1 text-sm border rounded mb-1"
                      />
                      <input
                        type="number"
                        value={criterion.max_points}
                        onChange={(e) => {
                          const updated = question3.rubric.map(c => 
                            c.id === criterion.id ? { ...c, max_points: parseInt(e.target.value) || 1 } : c
                          );
                          setQuestion3({ ...question3, rubric: updated });
                        }}
                        placeholder="Points"
                        min="1"
                        max="10"
                        className="w-20 px-2 py-1 text-sm border rounded"
                      />
                    </div>
                  ))}
                  <p className="text-xs text-gray-600 mt-2">
                    Total: {question3.rubric.reduce((sum, c) => sum + c.max_points, 0)} points
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  💡 <strong>Total Points:</strong> {question1.rubric.reduce((sum, c) => sum + c.max_points, 0) + question2.rubric.reduce((sum, c) => sum + c.max_points, 0) + question3.rubric.reduce((sum, c) => sum + c.max_points, 0)} points for this question group
                </p>
              </div>

              {/* Additional Metadata for Question Groups */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., biology, essay"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Source
                  </label>
                  <input
                    type="text"
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., DIM 2024"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Year
                  </label>
                  <input
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || new Date().getFullYear() })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    min="2000"
                    max={new Date().getFullYear() + 1}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Only show these fields for single question mode */}
          {createMode === 'single' && (
            <>
              {/* Question Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Question Text <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.question_text}
                  onChange={(e) => setFormData({ ...formData, question_text: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter the question text..."
                  required
                />
              </div>

          {/* Question Image - Upload or URL */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Question Image (Optional)
              </label>
              <button
                type="button"
                onClick={() => {
                  setUseImageUpload(!useImageUpload);
                  setFormData({ ...formData, question_image_url: '' });
                  setImagePreview(null);
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {useImageUpload ? '🔗 Use URL Instead' : '📤 Upload Image Instead'}
              </button>
            </div>

            {useImageUpload ? (
              <div className="space-y-3">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="image-upload"
                    disabled={uploadingImage}
                  />
                  <label
                    htmlFor="image-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    {uploadingImage ? (
                      <>
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-3"></div>
                        <p className="text-sm text-gray-600">Uploading image...</p>
                      </>
                    ) : imagePreview ? (
                      <>
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="max-h-48 rounded-lg mb-3"
                        />
                        <p className="text-sm text-green-600 font-medium">✓ Image uploaded successfully</p>
                        <p className="text-xs text-gray-500 mt-1">Click to change image</p>
                      </>
                    ) : (
                      <>
                        <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-sm text-gray-600">Click to upload an image</p>
                        <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 5MB</p>
                      </>
                    )}
                  </label>
                </div>
                {imagePreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview(null);
                      setFormData({ ...formData, question_image_url: '' });
                    }}
                    className="w-full px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    Remove Image
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="url"
                  value={formData.question_image_url}
                  onChange={(e) => setFormData({ ...formData, question_image_url: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://example.com/image.jpg"
                />
                {formData.question_image_url && (
                  <div className="border border-gray-200 rounded-lg p-2">
                    <img
                      src={formData.question_image_url}
                      alt="Preview"
                      className="max-h-48 mx-auto rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* MCQ Options (only for mcq type) */}
          {formData.question_type === 'mcq' && (
            <>
              <div className="grid grid-cols-1 gap-4">
                <h3 className="text-lg font-semibold text-gray-900">Answer Options (A-E) <span className="text-red-500">*</span></h3>
                
                {['A', 'B', 'C', 'D', 'E'].map((option) => (
                  <div key={option}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Option {option}
                    </label>
                    <input
                      type="text"
                      value={formData[`option_${option.toLowerCase()}` as keyof typeof formData] as string}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        [`option_${option.toLowerCase()}`]: e.target.value 
                      })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={`Enter option ${option}...`}
                      required
                    />
                  </div>
                ))}
              </div>

              {/* Correct Answer */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Correct Answer <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.correct_answer}
                  onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value as 'A' | 'B' | 'C' | 'D' | 'E' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                  <option value="E">E</option>
                </select>
              </div>
            </>
          )}

          {/* Codable Open Fields */}
          {formData.question_type === 'codable_open' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Correct Answer <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.expected_answer}
                  onChange={(e) => setFormData({ ...formData, expected_answer: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., 42, Paris, H2O"
                  required
                />
                <p className="mt-1 text-sm text-gray-500">The exact correct answer (case-insensitive matching)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Answer Keywords (comma-separated, optional)
                </label>
                <input
                  type="text"
                  value={formData.answer_keywords}
                  onChange={(e) => setFormData({ ...formData, answer_keywords: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., capital, France, city"
                />
                <p className="mt-1 text-sm text-gray-500">Keywords for partial matching (optional)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sample Answer (optional)
                </label>
                <textarea
                  value={formData.sample_answer}
                  onChange={(e) => setFormData({ ...formData, sample_answer: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Provide a model answer for reference..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Points
                </label>
                <input
                  type="number"
                  value={formData.max_points}
                  onChange={(e) => setFormData({ ...formData, max_points: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="1"
                  max="10"
                />
              </div>
            </>
          )}

          {/* Written Open Fields */}
          {formData.question_type === 'written_open' && (
            <>
              <div className="border border-purple-200 bg-purple-50 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">Grading Rubric <span className="text-red-500">*</span></h3>
                  <button
                    type="button"
                    onClick={() => {
                      const newCriterion: RubricCriterion = {
                        id: Date.now().toString(),
                        name: '',
                        description: '',
                        max_points: 1,
                      };
                      setRubricCriteria([...rubricCriteria, newCriterion]);
                    }}
                    className="px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                  >
                    + Add Criterion
                  </button>
                </div>

                {rubricCriteria.length === 0 ? (
                  <p className="text-sm text-gray-600 text-center py-4">No criteria added yet. Click "Add Criterion" to start.</p>
                ) : (
                  <div className="space-y-3">
                    {rubricCriteria.map((criterion, index) => (
                      <div key={criterion.id} className="bg-white border border-gray-200 rounded-lg p-3">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm font-medium text-gray-700">Criterion {index + 1}</span>
                          <button
                            type="button"
                            onClick={() => setRubricCriteria(rubricCriteria.filter(c => c.id !== criterion.id))}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={criterion.name}
                            onChange={(e) => {
                              const updated = rubricCriteria.map(c => 
                                c.id === criterion.id ? { ...c, name: e.target.value } : c
                              );
                              setRubricCriteria(updated);
                            }}
                            placeholder="Criterion name (e.g., Content Quality)"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                          />
                          <textarea
                            value={criterion.description}
                            onChange={(e) => {
                              const updated = rubricCriteria.map(c => 
                                c.id === criterion.id ? { ...c, description: e.target.value } : c
                              );
                              setRubricCriteria(updated);
                            }}
                            placeholder="Description (e.g., Answer demonstrates clear understanding)"
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                          />
                          <input
                            type="number"
                            value={criterion.max_points}
                            onChange={(e) => {
                              const updated = rubricCriteria.map(c => 
                                c.id === criterion.id ? { ...c, max_points: parseInt(e.target.value) || 1 } : c
                              );
                              setRubricCriteria(updated);
                            }}
                            placeholder="Max points"
                            min="1"
                            max="10"
                            className="w-32 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-purple-200">
                  <p className="text-sm font-medium text-gray-700">
                    Total Points: {rubricCriteria.reduce((sum, c) => sum + c.max_points, 0)}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sample Answer (optional)
                </label>
                <textarea
                  value={formData.sample_answer}
                  onChange={(e) => setFormData({ ...formData, sample_answer: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Provide a model answer for reference..."
                />
              </div>
            </>
          )}

          {/* Explanation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Explanation (Optional)
            </label>
            <textarea
              value={formData.explanation}
              onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Explain why this is the correct answer..."
            />
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Difficulty <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.difficulty}
              onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as QuestionDifficulty })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          {/* Additional Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., algebra, equations"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Source
              </label>
              <input
                type="text"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., DIM 2023"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Year
              </label>
              <input
                type="number"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || new Date().getFullYear() })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="2000"
                max={new Date().getFullYear() + 1}
              />
            </div>
          </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
