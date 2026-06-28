'use client';

import { useState, useEffect, useRef } from 'react';
import { Question, QuestionDifficulty, QuestionType, GradingRubric, RubricCriterion, QuestionGroup } from '@/types/questions';
import { questionService } from '@/services/questionService';
import { questionGroupService } from '@/services/questionGroupService';
import { topicService } from '@/services/topicService';
import { subtopicService } from '@/services/subtopicService';
import { useToast } from '@/contexts/ToastContext';
import type { TopicWithStats } from '@/types/subjects';
import type { SubtopicWithStats } from '@/types/subjects';
import { supabase } from '@/lib/supabase';

interface EditQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  questionId?: string;
  subjectId: string;
  subjects?: any[]; // For subject selection if needed
}

export default function EditQuestionModal({
  isOpen,
  onClose,
  onSuccess,
  questionId,
  subjectId,
}: EditQuestionModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupData, setGroupData] = useState<QuestionGroup | null>(null);
  const [contextText, setContextText] = useState('');
  const [contextImageUrl, setContextImageUrl] = useState('');
  const [question1, setQuestion1] = useState({ text: '', rubric: [] as RubricCriterion[], correctAnswer: '', question_image_url: '' });
  const [question2, setQuestion2] = useState({ text: '', rubric: [] as RubricCriterion[], correctAnswer: '', question_image_url: '' });
  const [question3, setQuestion3] = useState({ text: '', rubric: [] as RubricCriterion[], correctAnswer: '', question_image_url: '' });
  const [topics, setTopics] = useState<TopicWithStats[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [subtopics, setSubtopics] = useState<SubtopicWithStats[]>([]);
  const [loadingSubtopics, setLoadingSubtopics] = useState(false);
  const [subtopicId, setSubtopicId] = useState('');
  // Holds the subtopic_id from the loaded question so we can pre-fill after async load
  const pendingSubtopicIdRef = useRef('');
  const [showCreateTopic, setShowCreateTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicDescription, setNewTopicDescription] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingGroupImage, setUploadingGroupImage] = useState<string | null>(null); // 'context'|'q1'|'q2'|'q3'
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [useImageUpload, setUseImageUpload] = useState(false);
  const [formData, setFormData] = useState({
    subject_id: subjectId,
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
  const [rubricCriteria, setRubricCriteria] = useState<RubricCriterion[]>([]);

  useEffect(() => {
    if (isOpen && questionId) {
      loadQuestion();
    } else if (isOpen && !questionId) {
      // Reset form for create mode
      setFormData({
        subject_id: subjectId,
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
      setShowCreateTopic(false);
      setNewTopicName('');
      setNewTopicDescription('');
      setSubtopics([]);
      setSubtopicId('');
      setImagePreview(null);
      setUseImageUpload(false);
    }
  }, [isOpen, questionId]);

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
    // Only reset subtopicId when NOT in edit-mode pre-fill
    // (if pendingSubtopicIdRef is set, we'll restore it after fetch)
    if (!pendingSubtopicIdRef.current) {
      setSubtopicId('');
    }
    try {
      const result = await subtopicService.getSubtopicsByTopic(topicId);
      if (result.success && result.data) {
        const active = result.data.filter((s) => s.is_active);
        setSubtopics(active);
        // Apply pending pre-fill immediately after data loads (edit mode)
        if (pendingSubtopicIdRef.current) {
          const match = active.find(s => s.id === pendingSubtopicIdRef.current);
          setSubtopicId(match ? pendingSubtopicIdRef.current : '');
          pendingSubtopicIdRef.current = '';
        }
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

  const loadQuestion = async () => {
    if (!questionId) return;

    setLoading(true);
    
    // First try to load as a question group (silently fail if not a group)
    try {
      const groupResult = await questionGroupService.getQuestionGroup(questionId);
      
      if (groupResult.success && groupResult.data) {
      // This is a question group
      const group = groupResult.data;
      setIsGroupMode(true);
      setGroupData(group);
      setContextText(group.context_text);
      setContextImageUrl(group.context_image_url || '');
      
      // Load the 3 questions
      const questions = (group.questions || []).sort((a: any, b: any) => (a.group_order || 0) - (b.group_order || 0));
      if (questions[0]) {
        setQuestion1({
          text: questions[0].question_text,
          rubric: (questions[0].grading_rubric?.criteria || []).map((c: RubricCriterion, i: number) => ({ ...c, id: c.id || `q1-${Date.now()}-${i}` })),
          correctAnswer: questions[0].expected_answer || '',
          question_image_url: questions[0].question_image_url || '',
        });
      }
      if (questions[1]) {
        setQuestion2({
          text: questions[1].question_text,
          rubric: (questions[1].grading_rubric?.criteria || []).map((c: RubricCriterion, i: number) => ({ ...c, id: c.id || `q2-${Date.now()}-${i}` })),
          correctAnswer: questions[1].expected_answer || '',
          question_image_url: questions[1].question_image_url || '',
        });
      }
      if (questions[2]) {
        setQuestion3({
          text: questions[2].question_text,
          rubric: (questions[2].grading_rubric?.criteria || []).map((c: RubricCriterion, i: number) => ({ ...c, id: c.id || `q3-${Date.now()}-${i}` })),
          correctAnswer: questions[2].expected_answer || '',
          question_image_url: questions[2].question_image_url || '',
        });
      }
      
      // Set common form data from group
      // Subtopic lives on child questions (question_groups has no subtopic_id column)
      // Pre-fill from first child question so the dropdown loads the correct value
      pendingSubtopicIdRef.current = questions[0]?.subtopic_id || '';
      setFormData({
        ...formData,
        subject_id: group.subject_id,
        topic: group.topic || '',
        difficulty: group.difficulty,
        tags: group.tags?.join(', ') || '',
        source: group.source || '',
        year: group.year || new Date().getFullYear(),
      });
      
        setLoading(false);
        return;
      }
    } catch (error) {
      // Not a group, continue to load as single question
      console.log('Not a question group, loading as single question');
    }
    
    // Not a group, try to load as single question
    const result = await questionService.getQuestionById(questionId);
    
    if (result.success && result.data) {
      const q = result.data;
      setIsGroupMode(false);
      // Store subtopic_id for pre-fill once subtopics load
      pendingSubtopicIdRef.current = q.subtopic_id || '';
      setFormData({
        subject_id: q.subject_id,
        topic: q.topic || '',
        question_type: q.question_type,
        question_text: q.question_text,
        question_image_url: q.question_image_url || '',
        // MCQ fields
        option_a: q.option_a || '',
        option_b: q.option_b || '',
        option_c: q.option_c || '',
        option_d: q.option_d || '',
        option_e: q.option_e || '',
        correct_answer: (q.question_type === 'mcq' ? (q.correct_answer as 'A' | 'B' | 'C' | 'D' | 'E') : 'A'),
        // Open question fields - for codable_open, load correct_answer into expected_answer field for UI
        expected_answer: q.question_type === 'codable_open' ? (q.correct_answer as string || '') : (q.expected_answer || ''),
        answer_keywords: q.answer_keywords?.join(', ') || '',
        max_points: q.max_points,
        sample_answer: q.sample_answer || '',
        // Common fields
        explanation: q.explanation || '',
        difficulty: q.difficulty,
        tags: q.tags?.join(', ') || '',
        source: q.source || '',
        year: q.year || new Date().getFullYear(),
      });
      
      // Load rubric criteria for written_open questions
      if (q.question_type === 'written_open' && q.grading_rubric) {
        setRubricCriteria(q.grading_rubric.criteria || []);
      }
      
      // Set image preview if URL exists
      if (q.question_image_url) {
        setImagePreview(q.question_image_url);
      }
    } else {
      toast.error('Failed to load question');
      onClose();
    }
    setLoading(false);
  };

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
        display_order: 0,
      });

      if (result.success && result.data) {
        toast.success('Topic created successfully');
        setFormData({ ...formData, topic: newTopicName.trim() });
        setShowCreateTopic(false);
        setNewTopicName('');
        setNewTopicDescription('');
        await loadTopics();
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

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a valid image file');
      return;
    }

    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = fileName;

      const { data, error } = await supabase.storage
        .from('question-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('question-images')
        .getPublicUrl(filePath);

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

  // Delete an image from the question-images bucket (best-effort; never throws)
  const deleteFromStorage = async (url: string) => {
    try {
      const marker = '/question-images/';
      if (!url.includes(marker)) return;
      const path = url.split(marker)[1]?.split('?')[0];
      if (path) await supabase.storage.from('question-images').remove([path]);
    } catch {
      // Non-critical
    }
  };

  const handleGroupImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    fieldKey: string,
    onSuccess: (url: string) => void,
    oldUrl?: string,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be re-selected

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a valid image file');
      return;
    }

    setUploadingGroupImage(fieldKey);
    try {
      // Delete the old image from storage before uploading the replacement
      if (oldUrl) await deleteFromStorage(oldUrl);

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error } = await supabase.storage
        .from('question-images')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('question-images')
        .getPublicUrl(fileName);

      onSuccess(publicUrl);
      toast.success('Image uploaded successfully');
    } catch (error: any) {
      console.error('Group image upload error:', error);
      toast.error(error.message || 'Failed to upload image');
    } finally {
      setUploadingGroupImage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);

    // Handle question group update
    if (isGroupMode && groupData) {
      // Validate group data
      if (!contextText.trim()) {
        toast.error('Context text is required for question groups');
        setLoading(false);
        return;
      }

      if (!question1.text.trim() || !question2.text.trim() || !question3.text.trim()) {
        toast.error('All 3 questions are required');
        setLoading(false);
        return;
      }

      if (question1.rubric.length === 0 || question2.rubric.length === 0 || question3.rubric.length === 0) {
        toast.error('Each question must have at least one rubric criterion');
        setLoading(false);
        return;
      }

      try {
        const result = await questionGroupService.updateQuestionGroup(groupData.id, {
          subject_id: formData.subject_id,
          topic: formData.topic || undefined,
          subtopic_id: subtopicId || null,
          context_text: contextText.trim(),
          context_image_url: contextImageUrl.trim() || undefined,
          difficulty: formData.difficulty,
          tags: formData.tags.trim() ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
          source: formData.source.trim() || undefined,
          year: formData.year || undefined,
          questions: [
            {
              question_text: question1.text.trim(),
              question_image_url: question1.question_image_url.trim() || undefined,
              expected_answer: question1.correctAnswer.trim() || undefined,
              grading_rubric: {
                criteria: question1.rubric,
                total_points: question1.rubric.reduce((sum, c) => sum + c.max_points, 0),
              },
              max_points: question1.rubric.reduce((sum, c) => sum + c.max_points, 0),
            },
            {
              question_text: question2.text.trim(),
              question_image_url: question2.question_image_url.trim() || undefined,
              expected_answer: question2.correctAnswer.trim() || undefined,
              grading_rubric: {
                criteria: question2.rubric,
                total_points: question2.rubric.reduce((sum, c) => sum + c.max_points, 0),
              },
              max_points: question2.rubric.reduce((sum, c) => sum + c.max_points, 0),
            },
            {
              question_text: question3.text.trim(),
              question_image_url: question3.question_image_url.trim() || undefined,
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
          toast.success('Question group updated successfully');
          onSuccess();
          onClose();
        } else {
          toast.error(result.error || 'Failed to update question group');
        }
      } catch (error: any) {
        console.error('Update group error:', error);
        toast.error(error.message || 'Failed to update question group');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Handle single question validation and update
    if (!formData.question_text.trim()) {
      toast.error('Question text is required');
      setLoading(false);
      return;
    }

    // Type-specific validation
    if (formData.question_type === 'mcq') {
      if (!formData.option_a.trim() || !formData.option_b.trim() || 
          !formData.option_c.trim() || !formData.option_d.trim() || !formData.option_e.trim()) {
        toast.error('All 5 options (A-E) are required for MCQ questions');
        setLoading(false);
        return;
      }
    } else if (formData.question_type === 'codable_open') {
      if (!formData.expected_answer.trim()) {
        toast.error('Correct answer is required for codable open questions');
        setLoading(false);
        return;
      }
    } else if (formData.question_type === 'written_open') {
      if (rubricCriteria.length === 0) {
        toast.error('At least one rubric criterion is required for written open questions');
        setLoading(false);
        return;
      }
    }

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
      max_points: formData.max_points,
      exclude_from_practice: formData.question_type === 'written_open',
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

    let result;
    if (questionId) {
      // Update existing question
      result = await questionService.updateQuestion(questionId, questionData);
    } else {
      // Create new question
      result = await questionService.createQuestion(questionData);
    }

    setLoading(false);

    if (result.success) {
      toast.success(questionId ? 'Question updated successfully' : 'Question created successfully');
      onSuccess();
      onClose();
    } else {
      toast.error(result.error || 'Failed to save question');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-3xl w-full my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {questionId ? 'Edit Question' : 'Create New Question'}
          </h2>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
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

          {/* Show Question Group UI or Single Question UI */}
          {isGroupMode ? (
            <>
              {/* Question Group Edit UI */}
              <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4 mb-4">
                <h3 className="text-lg font-semibold text-purple-900 mb-2">
                  📚 Editing Question Group (Situasiya)
                </h3>
                <p className="text-sm text-purple-700">
                  This is a question group with shared context and 3 written open questions.
                </p>
              </div>

              {/* Context Section */}
              <div className="border-2 border-purple-200 rounded-lg p-4 bg-purple-25">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  📖 Situasiya (Shared Context) <span className="text-red-500">*</span>
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  The context text that all 3 questions refer to
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
                    Context Image <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={contextImageUrl}
                      onChange={(e) => setContextImageUrl(e.target.value)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="https://example.com/context-image.jpg"
                    />
                    <label
                      htmlFor="context-image-upload"
                      className={`px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer whitespace-nowrap ${
                        uploadingGroupImage === 'context'
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100'
                      }`}
                    >
                      {uploadingGroupImage === 'context' ? 'Uploading…' : '📤 Upload'}
                    </label>
                    <input
                      type="file"
                      id="context-image-upload"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingGroupImage === 'context'}
                      onChange={(e) => handleGroupImageUpload(e, 'context', (url) => setContextImageUrl(url), contextImageUrl)}
                    />
                  </div>
                  {contextImageUrl && (
                    <div className="mt-2 border border-gray-200 rounded-lg p-2 relative">
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteFromStorage(contextImageUrl);
                          setContextImageUrl('');
                        }}
                        className="absolute top-1 right-1 z-10 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-base leading-none"
                        title="Remove image"
                      >
                        ×
                      </button>
                      <img src={contextImageUrl} alt="Context preview" className="max-h-40 mx-auto rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  )}
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

                {/* Question Image (Optional) */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Question Image <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={question1.question_image_url}
                      onChange={(e) => setQuestion1({ ...question1, question_image_url: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="https://example.com/image.jpg"
                    />
                    <label
                      htmlFor="q1-image-upload"
                      className={`px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer whitespace-nowrap ${
                        uploadingGroupImage === 'q1'
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                      }`}
                    >
                      {uploadingGroupImage === 'q1' ? 'Uploading…' : '📤 Upload'}
                    </label>
                    <input
                      type="file"
                      id="q1-image-upload"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingGroupImage === 'q1'}
                      onChange={(e) => handleGroupImageUpload(e, 'q1', (url) => setQuestion1({ ...question1, question_image_url: url }))}
                    />
                  </div>
                  {question1.question_image_url && (
                    <div className="mt-2 border border-gray-200 rounded-lg p-2">
                      <img src={question1.question_image_url} alt="Preview" className="max-h-32 mx-auto rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  )}
                </div>
                
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
                        const newCriterion: RubricCriterion = {
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
                    <div key={criterion.id ?? `q1-crit-${idx}`} className="bg-white rounded p-2 mb-2">
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

                {/* Question Image (Optional) */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Question Image <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={question2.question_image_url}
                      onChange={(e) => setQuestion2({ ...question2, question_image_url: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="https://example.com/image.jpg"
                    />
                    <label
                      htmlFor="q2-image-upload"
                      className={`px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer whitespace-nowrap ${
                        uploadingGroupImage === 'q2'
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                      }`}
                    >
                      {uploadingGroupImage === 'q2' ? 'Uploading…' : '📤 Upload'}
                    </label>
                    <input
                      type="file"
                      id="q2-image-upload"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingGroupImage === 'q2'}
                      onChange={(e) => handleGroupImageUpload(e, 'q2', (url) => setQuestion2({ ...question2, question_image_url: url }))}
                    />
                  </div>
                  {question2.question_image_url && (
                    <div className="mt-2 border border-gray-200 rounded-lg p-2">
                      <img src={question2.question_image_url} alt="Preview" className="max-h-32 mx-auto rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  )}
                </div>
                
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
                        const newCriterion: RubricCriterion = {
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
                    <div key={criterion.id ?? `q2-crit-${idx}`} className="bg-white rounded p-2 mb-2">
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

                {/* Question Image (Optional) */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Question Image <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={question3.question_image_url}
                      onChange={(e) => setQuestion3({ ...question3, question_image_url: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="https://example.com/image.jpg"
                    />
                    <label
                      htmlFor="q3-image-upload"
                      className={`px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer whitespace-nowrap ${
                        uploadingGroupImage === 'q3'
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                      }`}
                    >
                      {uploadingGroupImage === 'q3' ? 'Uploading…' : '📤 Upload'}
                    </label>
                    <input
                      type="file"
                      id="q3-image-upload"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingGroupImage === 'q3'}
                      onChange={(e) => handleGroupImageUpload(e, 'q3', (url) => setQuestion3({ ...question3, question_image_url: url }))}
                    />
                  </div>
                  {question3.question_image_url && (
                    <div className="mt-2 border border-gray-200 rounded-lg p-2">
                      <img src={question3.question_image_url} alt="Preview" className="max-h-32 mx-auto rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  )}
                </div>
                
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
                        const newCriterion: RubricCriterion = {
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
                    <div key={criterion.id ?? `q3-crit-${idx}`} className="bg-white rounded p-2 mb-2">
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
                </div>
              </div>

              {/* Additional Metadata for Groups */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="2024"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Single Question Edit UI */}
              {/* Question Type Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Question Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-4">
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
          </div>

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
                    id="image-upload-edit"
                    disabled={uploadingImage}
                  />
                  <label
                    htmlFor="image-upload-edit"
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

          {/* Explanation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Explanation (Optional)
            </label>
            <textarea
              value={formData.explanation}
              onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
              placeholder="Explain why this is the correct answer..."
            />
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Difficulty *
            </label>
            <select
              value={formData.difficulty}
              onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as QuestionDifficulty })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tags (Optional)
            </label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="tag1, tag2, tag3"
            />
            <p className="text-xs text-gray-500 mt-1">Separate tags with commas</p>
          </div>

          {/* Source and Year */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source (Optional)
              </label>
              <input
                type="text"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., DIM 2024"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Year (Optional)
              </label>
              <input
                type="number"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || new Date().getFullYear() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="2000"
                max="2100"
              />
            </div>
          </div>
        </>
        )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Saving...' : isGroupMode ? 'Update Question Group' : questionId ? 'Update Question' : 'Create Question'}
          </button>
        </div>
      </div>
    </div>
  );
}
