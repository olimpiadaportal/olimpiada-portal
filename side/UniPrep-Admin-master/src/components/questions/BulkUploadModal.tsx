'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { questionService } from '@/services/questionService';
import { questionGroupService } from '@/services/questionGroupService';
import { topicService } from '@/services/topicService';
import { Subject, QuestionBulkUpload, QuestionType, QuestionImport } from '@/types/questions';
import { useToast } from '@/contexts/ToastContext';
import { formatRelativeTime, formatDateTime } from '@/utils/timeUtils';
import type { TopicWithStats } from '@/types/subjects';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  subjects: Subject[];
}

interface FileQueueItem {
  id: string;
  fileName: string;
  jsonText: string;
  parsedData: any[];
  status: 'pending' | 'validating' | 'valid' | 'invalid' | 'uploading' | 'success' | 'failed';
  errors: string[];
  warnings: string[];
  questionCount: number;
  contentHash: string;
  order: number;
  uploadResult?: { successful: number; failed: number };
  errorMessage?: string;
}

async function computeHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsText(file);
  });
}

export default function BulkUploadModal({
  isOpen,
  onClose,
  onSuccess,
  subjects,
}: BulkUploadModalProps) {
  const toast = useToast();
  const [uploadMode, setUploadMode] = useState<'single' | 'group'>('single');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedQuestionType, setSelectedQuestionType] = useState<QuestionType>('mcq');
  const [topics, setTopics] = useState<TopicWithStats[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [importHistory, setImportHistory] = useState<QuestionImport[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);

  // Multi-file queue state
  const [fileQueue, setFileQueue] = useState<FileQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ currentIndex: number; total: number } | null>(null);
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const processedHashesRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImportHistory = async () => {
    setLoadingHistory(true);
    try {
      const result = await questionService.getImportHistory(8);
      if (result.success && result.data) {
        setImportHistory(result.data);
      }
    } catch (error) {
      console.error('Failed to load import history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadImportHistory();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedSubject) {
      loadTopics();
    } else {
      setTopics([]);
    }
  }, [selectedSubject]);

  const loadTopics = async () => {
    if (!selectedSubject) return;
    setLoadingTopics(true);
    try {
      const result = await topicService.getTopicsBySubject(selectedSubject);
      if (result.success && result.data) {
        setTopics(result.data);
      }
    } catch (error) {
      console.error('Failed to load topics:', error);
    } finally {
      setLoadingTopics(false);
    }
  };

  if (!isOpen) return null;

  // ──────────────────────────────────────────────
  // Validation helpers (reused from original)
  // ──────────────────────────────────────────────

  const validateGroupJSON = (parsed: any): { errors: string[]; warnings: string[]; count: number } => {
    const errors: string[] = [];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      errors.push('Must be a non-empty array of question group objects');
      return { errors, warnings: [], count: 0 };
    }
    let totalQs = 0;
    parsed.forEach((group: any, i: number) => {
      if (!group.context_text && !group.context_image_url) {
        errors.push(`Group ${i + 1}: must have "context_text" or "context_image_url"`);
      }
      if (!group.questions || !Array.isArray(group.questions) || group.questions.length === 0) {
        errors.push(`Group ${i + 1}: missing or empty "questions" array`);
      } else if (group.questions.length !== 3) {
        errors.push(`Group ${i + 1}: must have exactly 3 questions (found ${group.questions.length})`);
      } else {
        totalQs += group.questions.length;
        group.questions.forEach((q: any, qi: number) => {
          if (!q.question_text || typeof q.question_text !== 'string') {
            errors.push(`Group ${i + 1}, Q${qi + 1}: missing "question_text"`);
          }
          if (!q.rubric || !Array.isArray(q.rubric) || q.rubric.length === 0) {
            errors.push(`Group ${i + 1}, Q${qi + 1}: missing "rubric" array`);
          } else {
            q.rubric.forEach((r: any, ri: number) => {
              if (!r.name) {
                errors.push(`Group ${i + 1}, Q${qi + 1}, Rubric ${ri + 1}: missing "name"`);
              }
              if (typeof r.max_points !== 'number' || r.max_points <= 0) {
                errors.push(`Group ${i + 1}, Q${qi + 1}, Rubric ${ri + 1}: "max_points" must be a positive number`);
              }
            });
          }
        });
      }
    });
    return { errors, warnings: [], count: totalQs || parsed.length };
  };

  const validateSingleJSON = async (parsed: any): Promise<{ errors: string[]; warnings: string[]; count: number }> => {
    const topicNames = topics.map(t => t.topic_name);
    const validation = await questionService.validateBulkUploadJSON(parsed, selectedSubject, topicNames);
    return {
      errors: validation.errors,
      warnings: validation.warnings || [],
      count: Array.isArray(parsed) ? parsed.length : 0,
    };
  };

  // ──────────────────────────────────────────────
  // Multi-file selection handler
  // ──────────────────────────────────────────────

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Convert to array to preserve selection order
    const fileArray = Array.from(files);

    const { validateImportFile } = await import('@/utils/importValidation');

    const currentMaxOrder = fileQueue.length > 0 ? Math.max(...fileQueue.map(f => f.order)) : 0;
    const newItems: FileQueueItem[] = [];
    const existingHashes = new Set(fileQueue.map(f => f.contentHash));

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];

      // Security validation
      const fileValidation = validateImportFile(file);
      if (!fileValidation.valid) {
        toast.error(`${file.name}: ${fileValidation.error}`);
        continue;
      }

      let text: string;
      try {
        text = await readFileAsText(file);
      } catch {
        toast.error(`Failed to read: ${file.name}`);
        continue;
      }

      // Compute content hash for duplicate detection
      const hash = await computeHash(text);

      // Guard 1: Check against files already in the queue
      if (existingHashes.has(hash)) {
        toast.warning(`Duplicate skipped: "${file.name}" has identical content to a file already in queue`);
        continue;
      }

      // Guard 2: Check against previously uploaded files (this session)
      if (processedHashesRef.current.has(hash)) {
        toast.warning(`Already uploaded: "${file.name}" was already successfully uploaded in this session`);
        continue;
      }

      // Parse and validate
      let parsed: any;
      let errors: string[] = [];
      let warnings: string[] = [];
      let questionCount = 0;

      try {
        parsed = JSON.parse(text);
        if (uploadMode === 'group') {
          const result = validateGroupJSON(parsed);
          errors = result.errors;
          warnings = result.warnings;
          questionCount = result.count;
        } else {
          const result = await validateSingleJSON(parsed);
          errors = result.errors;
          warnings = result.warnings;
          questionCount = result.count;
        }
      } catch {
        errors = ['Invalid JSON format'];
        parsed = [];
      }

      const item: FileQueueItem = {
        id: crypto.randomUUID(),
        fileName: file.name,
        jsonText: text,
        parsedData: Array.isArray(parsed) ? parsed : [],
        status: errors.length > 0 ? 'invalid' : 'valid',
        errors,
        warnings,
        questionCount,
        contentHash: hash,
        order: currentMaxOrder + i + 1,
      };

      newItems.push(item);
      existingHashes.add(hash);
    }

    if (newItems.length > 0) {
      setFileQueue(prev => [...prev, ...newItems]);
      const validCount = newItems.filter(f => f.status === 'valid').length;
      const invalidCount = newItems.filter(f => f.status === 'invalid').length;
      let msg = `Added ${validCount} file(s)`;
      if (invalidCount > 0) msg += ` (${invalidCount} with errors)`;
      toast.success(msg);
    }

    // Reset input so the same files can be re-selected if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    if (isProcessing) return;
    setFileQueue(prev => prev.filter(f => f.id !== id));
  };

  const clearQueue = () => {
    if (isProcessing) return;
    setFileQueue([]);
  };

  // ──────────────────────────────────────────────
  // Upload helpers (shared logic)
  // ──────────────────────────────────────────────

  const mapDifficultyToTopicLevel = (difficulty?: string): 'beginner' | 'intermediate' | 'advanced' => {
    switch (difficulty?.toLowerCase()) {
      case 'easy': return 'beginner';
      case 'hard': return 'advanced';
      default: return 'intermediate';
    }
  };

  const extractTopicsFromQuestions = (questions: QuestionBulkUpload[]): Map<string, string> => {
    const topicDifficulties = new Map<string, Map<string, number>>();
    questions.forEach(q => {
      if (q.topic && q.topic.trim()) {
        const topic = q.topic.trim();
        if (!topicDifficulties.has(topic)) {
          topicDifficulties.set(topic, new Map());
        }
        const difficulty = q.difficulty || 'medium';
        const counts = topicDifficulties.get(topic)!;
        counts.set(difficulty, (counts.get(difficulty) || 0) + 1);
      }
    });
    const result = new Map<string, string>();
    topicDifficulties.forEach((counts, topic) => {
      let maxCount = 0;
      let mostCommon = 'medium';
      counts.forEach((count, diff) => {
        if (count > maxCount) { maxCount = count; mostCommon = diff; }
      });
      result.set(topic, mostCommon);
    });
    return result;
  };

  // ──────────────────────────────────────────────
  // MAIN UPLOAD HANDLER — Sequential, Guarded
  // ──────────────────────────────────────────────

  const handleUpload = async () => {
    if (!selectedSubject) {
      toast.error('Please select a subject');
      return;
    }

    const validFiles = fileQueue.filter(f => f.status === 'valid');
    if (validFiles.length === 0) {
      toast.error('No valid files to upload');
      return;
    }

    setIsProcessing(true);
    setUploadProgress({ currentIndex: 0, total: validFiles.length });

    try {
      // ── Phase 1: Pre-resolve all topics/subtopics across ALL files ──
      toast.info('Preparing topics and subtopics...');

      const allTopicsMap = new Map<string, string>(); // topicName → difficulty
      const allSubtopicPairs = new Map<string, { topicName: string; subtopicName: string }>();

      for (const file of validFiles) {
        for (const item of file.parsedData) {
          if (item.topic) {
            allTopicsMap.set(item.topic, item.difficulty || 'medium');
          }
          if (item.topic && item.subtopic) {
            const key = `${item.topic.toLowerCase()}|${item.subtopic.toLowerCase()}`;
            if (!allSubtopicPairs.has(key)) {
              allSubtopicPairs.set(key, { topicName: item.topic, subtopicName: item.subtopic });
            }
          }
        }
      }

      // Create missing topics
      if (allTopicsMap.size > 0) {
        const existingTopicNames = new Set(topics.map(t => t.topic_name.toLowerCase()));
        const topicsToCreate = [...allTopicsMap.entries()].filter(
          ([name]) => !existingTopicNames.has(name.toLowerCase())
        );
        if (topicsToCreate.length > 0) {
          toast.info(`Creating ${topicsToCreate.length} new topic(s)...`);
          for (const [name, difficulty] of topicsToCreate) {
            await topicService.createTopic({
              subject_id: selectedSubject,
              topic_name: name,
              topic_name_az: name,
              difficulty_level: mapDifficultyToTopicLevel(difficulty),
              display_order: topics.length + 1,
            });
          }
          await loadTopics();
        }
      }

      // Resolve subtopics
      const freshTopicsResult = await topicService.getTopicsBySubject(selectedSubject);
      const freshTopics = freshTopicsResult.data || [];
      const topicNameToId = new Map<string, string>();
      freshTopics.forEach(t => topicNameToId.set(t.topic_name.toLowerCase(), t.id));

      const subtopicMap = new Map<string, string>();
      if (allSubtopicPairs.size > 0) {
        toast.info(`Resolving ${allSubtopicPairs.size} subtopic(s)...`);
        for (const [key, { topicName, subtopicName }] of allSubtopicPairs) {
          const topicId = topicNameToId.get(topicName.toLowerCase());
          if (!topicId) continue;
          const subtopicResult = await topicService.ensureSubtopicExists(selectedSubject, topicId, subtopicName);
          if (subtopicResult.success && subtopicResult.data) {
            subtopicMap.set(key, subtopicResult.data);
          }
        }
      }

      // ── Phase 2: Process files one by one in order ──
      let totalSuccessFiles = 0;
      let totalFailedFiles = 0;
      let totalQuestionsImported = 0;
      const allAffectedTopics = new Set<string>();

      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];

        // ── GUARD: Re-check hash before processing ──
        if (processedHashesRef.current.has(file.contentHash)) {
          setFileQueue(prev => prev.map(f =>
            f.id === file.id ? { ...f, status: 'failed' as const, errorMessage: 'Duplicate: already uploaded' } : f
          ));
          totalFailedFiles++;
          continue;
        }

        // Update progress
        setUploadProgress({ currentIndex: i + 1, total: validFiles.length });
        setFileQueue(prev => prev.map(f =>
          f.id === file.id ? { ...f, status: 'uploading' as const } : f
        ));

        try {
          if (uploadMode === 'group') {
            // ── Group upload ──
            const questionGroups = file.parsedData;
            let successCount = 0;
            let failCount = 0;

            for (const group of questionGroups) {
              const subtopicKey = group.topic && group.subtopic
                ? `${group.topic.toLowerCase()}|${group.subtopic.toLowerCase()}`
                : null;
              const subtopic_id = subtopicKey ? subtopicMap.get(subtopicKey) : undefined;

              const rawType = group.question_type || 'written_open';
              const question_type: 'written_open' | 'codable_open' =
                rawType === 'codeable_open' ? 'codable_open' : rawType;

              const result = await questionGroupService.createQuestionGroup({
                subject_id: selectedSubject,
                topic: group.topic,
                subtopic_id,
                question_type,
                context_text: group.context_text,
                context_image_url: group.context_image_url,
                difficulty: group.difficulty || 'medium',
                tags: group.tags,
                source: group.source,
                year: group.year,
                questions: (group.questions || []).map((q: any) => ({
                  question_text: q.question_text,
                  question_image_url: q.question_image_url,
                  expected_answer: q.expected_answer,
                  grading_rubric: {
                    criteria: q.rubric,
                    total_points: q.rubric.reduce((sum: number, c: any) => sum + c.max_points, 0),
                  },
                  max_points: q.rubric.reduce((sum: number, c: any) => sum + c.max_points, 0),
                  sample_answer: q.sample_answer,
                  explanation: q.explanation,
                })),
              });

              if (result.success) {
                successCount++;
                if (group.topic) allAffectedTopics.add(group.topic);
              } else {
                failCount++;
              }
            }

            const totalSubQs = questionGroups
              .slice(0, successCount)
              .reduce((sum: number, g: any) => sum + (g.questions?.length || 0), 0);

            // Log import for this file
            await questionService.logImport({
              subjectId: selectedSubject,
              filename: file.fileName,
              totalQuestions: totalSubQs,
              successful: totalSubQs,
              failed: failCount,
            });

            // Mark file status
            processedHashesRef.current.add(file.contentHash);
            setFileQueue(prev => prev.map(f =>
              f.id === file.id ? {
                ...f,
                status: (failCount > 0 && successCount === 0) ? 'failed' as const : 'success' as const,
                uploadResult: { successful: successCount, failed: failCount },
              } : f
            ));
            totalSuccessFiles++;
            totalQuestionsImported += totalSubQs;

          } else {
            // ── Single questions upload ──
            const questions: QuestionBulkUpload[] = file.parsedData;

            // Augment with subtopic_ids
            const questionsWithSubtopicIds = questions.map(q => {
              if (q.subtopic && q.topic) {
                const key = `${q.topic.toLowerCase()}|${q.subtopic.toLowerCase()}`;
                const subtopicId = subtopicMap.get(key);
                if (subtopicId) return { ...q, subtopic_id: subtopicId };
              }
              return q;
            });

            const result = await questionService.bulkInsertQuestions(
              questionsWithSubtopicIds,
              selectedSubject,
              undefined,
              file.fileName
            );

            if (result.success && result.data) {
              processedHashesRef.current.add(file.contentHash);
              setFileQueue(prev => prev.map(f =>
                f.id === file.id ? {
                  ...f,
                  status: 'success' as const,
                  uploadResult: { successful: result.data!.successful, failed: result.data!.failed },
                } : f
              ));
              totalSuccessFiles++;
              totalQuestionsImported += result.data.successful;

              // Collect affected topics
              questions.forEach(q => { if (q.topic) allAffectedTopics.add(q.topic); });
            } else {
              setFileQueue(prev => prev.map(f =>
                f.id === file.id ? {
                  ...f,
                  status: 'failed' as const,
                  errorMessage: result.error || 'Upload failed',
                } : f
              ));
              totalFailedFiles++;
            }
          }
        } catch (error: any) {
          setFileQueue(prev => prev.map(f =>
            f.id === file.id ? {
              ...f,
              status: 'failed' as const,
              errorMessage: error.message || 'Unexpected error',
            } : f
          ));
          totalFailedFiles++;
        }
      }

      // ── Phase 3: Summary ──
      if (allAffectedTopics.size > 0) {
        await topicService.touchTopicTimestamps(selectedSubject, Array.from(allAffectedTopics));
      }

      if (totalSuccessFiles > 0) {
        toast.success(
          `Imported ${totalQuestionsImported} questions from ${totalSuccessFiles} file(s) successfully!`
        );
      }
      if (totalFailedFiles > 0) {
        toast.warning(`${totalFailedFiles} file(s) failed to import`);
      }

      loadImportHistory();
      if (totalSuccessFiles > 0) {
        onSuccess();
      }
    } catch (error: any) {
      toast.error(error.message || 'An error occurred during upload');
    } finally {
      setIsProcessing(false);
      setUploadProgress(null);
    }
  };

  // ──────────────────────────────────────────────
  // Template download (unchanged)
  // ──────────────────────────────────────────────

  const downloadTemplate = () => {
    let template: any[];
    let filename: string;

    if (uploadMode === 'group') {
      template = [
        {
          context_text: 'Aşağıdakı mətni oxuyun və suallara cavab verin:\n\nAzərbaycan Respublikası Cənubi Qafqazda yerləşən müstəqil dövlətdir. Paytaxtı Bakı şəhəridir. Ölkənin ərazisi 86,600 km² təşkil edir və əhalisi təqribən 10 milyon nəfərdir.',
          context_image_url: 'https://example.com/map.jpg',
          topic: 'Geography',
          subtopic: 'Azərbaycan',
          difficulty: 'medium',
          tags: ['coğrafiya', 'azərbaycan'],
          source: 'DIM 2024',
          year: 2024,
          questions: [
            { question_text: 'Azərbaycanın paytaxtı hansı şəhərdir?', expected_answer: 'Azərbaycanın paytaxtı Bakı şəhəridir.', rubric: [{ name: 'Düzgün cavab', description: 'Bakı şəhərini düzgün qeyd etmək', max_points: 2 }] },
            { question_text: 'Azərbaycanın ərazisi neçə km² təşkil edir?', expected_answer: 'Azərbaycanın ərazisi 86,600 km² təşkil edir.', rubric: [{ name: 'Dəqiq rəqəm', description: '86,600 km² göstərmək', max_points: 2 }] },
            { question_text: 'Azərbaycanın əhalisi təqribən neçə nəfərdir?', expected_answer: 'Azərbaycanın əhalisi təqribən 10 milyon nəfərdir.', rubric: [{ name: 'Təxmini rəqəm', description: '10 milyon ətrafında cavab', max_points: 2 }] },
          ],
        },
      ];
      filename = 'question-groups-template.json';
    } else if (selectedQuestionType === 'mcq') {
      template = [
        { question_type: 'mcq', topic: 'Algebra', subtopic: 'Basic Operations', difficulty: 'easy', question_text: '2 + 2 nədir?', option_a: '3', option_b: '4', option_c: '5', option_d: '6', option_e: '7', correct_answer: 'B', explanation: '2 + 2 = 4', tags: ['riyaziyyat', 'toplama'], source: 'Nümunə sual', year: 2024 },
        { question_type: 'mcq', topic: 'Geometry', difficulty: 'medium', question_text: 'Üçbucağın daxili bucaqlarının cəmi neçədir?', option_a: '90°', option_b: '180°', option_c: '270°', option_d: '360°', option_e: '450°', correct_answer: 'B', explanation: 'Üçbucağın daxili bucaqlarının cəmi həmişə 180° olur.' },
      ];
      filename = 'mcq-template.json';
    } else if (selectedQuestionType === 'codable_open') {
      template = [
        { question_type: 'codable_open', topic: 'Geography', subtopic: 'Capital Cities', difficulty: 'easy', question_text: 'Azərbaycanın paytaxtı hansı şəhərdir?', correct_answer: 'Bakı', answer_keywords: ['Bakı', 'paytaxt', 'şəhər'], max_points: 1, sample_answer: 'Azərbaycanın paytaxtı Bakı şəhəridir.', explanation: 'Bakı Azərbaycanın paytaxtı və ən böyük şəhəridir.', tags: ['coğrafiya', 'paytaxt'], source: 'Nümunə sual', year: 2024 },
        { question_type: 'codable_open', topic: 'Chemistry', difficulty: 'medium', question_text: 'Suyun kimyəvi formulunu yazın.', correct_answer: 'H2O', answer_keywords: ['H2O', 'su', 'hidrogen', 'oksigen'], max_points: 2, explanation: 'Su molekulu 2 hidrogen və 1 oksigen atomundan ibarətdir.' },
      ];
      filename = 'codable-open-template.json';
    } else {
      template = [
        { question_type: 'written_open', topic: 'Literature', difficulty: 'hard', question_text: 'Nizami Gəncəvinin "Xəmsə" əsərinin ədəbi əhəmiyyətini izah edin.', grading_rubric: { criteria: [{ id: '1', name: 'Məzmun keyfiyyəti', description: 'Cavab əsərin əhəmiyyətini aydın şəkildə izah edir', max_points: 3 }, { id: '2', name: 'Dil və üslub', description: 'Düzgün dil və ədəbi terminlərdən istifadə', max_points: 2 }], total_points: 5 }, max_points: 5, sample_answer: 'Nizami Gəncəvinin "Xəmsə" əsəri dünya ədəbiyyatında mühüm yer tutur...', explanation: 'Bu sual tələbənin ədəbi təhlil bacarığını yoxlayır.', tags: ['ədəbiyyat', 'klassik'], source: 'Nümunə sual', year: 2024 },
      ];
      filename = 'written-open-template.json';
    }

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ──────────────────────────────────────────────
  // Derived values
  // ──────────────────────────────────────────────

  const validFileCount = fileQueue.filter(f => f.status === 'valid').length;
  const totalQuestionCount = fileQueue.filter(f => f.status === 'valid' || f.status === 'success').reduce((sum, f) => sum + f.questionCount, 0);
  const hasAnyErrors = fileQueue.some(f => f.status === 'invalid');
  const isUploadComplete = isProcessing === false && fileQueue.length > 0 && fileQueue.every(f => f.status === 'success' || f.status === 'failed' || f.status === 'invalid');
  const successFileCount = fileQueue.filter(f => f.status === 'success').length;

  // ──────────────────────────────────────────────
  // Status badge component
  // ──────────────────────────────────────────────

  const StatusBadge = ({ status }: { status: FileQueueItem['status'] }) => {
    const config = {
      pending: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Pending' },
      validating: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Validating...' },
      valid: { bg: 'bg-green-100', text: 'text-green-700', label: 'Ready' },
      invalid: { bg: 'bg-red-100', text: 'text-red-700', label: 'Invalid' },
      uploading: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Uploading...' },
      success: { bg: 'bg-green-100', text: 'text-green-700', label: 'Done' },
      failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
    }[status];
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {status === 'uploading' && (
          <svg className="animate-spin -ml-0.5 mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        {status === 'success' && (
          <svg className="-ml-0.5 mr-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {config.label}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Bulk Upload Questions</h2>
              {fileQueue.length > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  {fileQueue.length} file(s) queued {validFileCount > 0 && `· ${validFileCount} ready · ${totalQuestionCount} questions`}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              disabled={isProcessing}
              title={isProcessing ? 'Cannot close during upload' : 'Close'}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Subject Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Subject *
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isProcessing}
            >
              <option value="">Choose a subject...</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name_en}
                </option>
              ))}
            </select>
          </div>

          {/* Upload Mode Toggle */}
          <div className="border-2 border-blue-200 bg-blue-50 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              What would you like to upload?
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => { setUploadMode('single'); if (!isProcessing) setFileQueue([]); }}
                disabled={isProcessing}
                className={`p-4 border-2 rounded-lg text-center transition-all ${
                  uploadMode === 'single'
                    ? 'border-blue-600 bg-white shadow-md'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                <div className="text-3xl mb-2">📝</div>
                <div className="font-semibold text-gray-900">Single Questions</div>
                <div className="text-xs text-gray-500 mt-1">MCQ or Short Answer</div>
              </button>

              <button
                type="button"
                onClick={() => { setUploadMode('group'); if (!isProcessing) setFileQueue([]); }}
                disabled={isProcessing}
                className={`p-4 border-2 rounded-lg text-center transition-all ${
                  uploadMode === 'group'
                    ? 'border-purple-600 bg-white shadow-md'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                <div className="text-3xl mb-2">📚</div>
                <div className="font-semibold text-gray-900">Question Groups</div>
                <div className="text-xs text-gray-500 mt-1">Situasiya (1 context + 3 questions)</div>
              </button>
            </div>
          </div>

          {/* Question Type Selection - Only for Single Mode */}
          {uploadMode === 'single' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Question Type *
              </label>
              <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setSelectedQuestionType('mcq')}
                disabled={isProcessing}
                className={`p-4 border-2 rounded-lg text-center transition-all ${
                  selectedQuestionType === 'mcq'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="text-3xl mb-2">📝</div>
                <div className="font-semibold text-gray-900">Multiple Choice</div>
                <div className="text-xs text-gray-500 mt-1">5 options (A-E)</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedQuestionType('codable_open')}
                disabled={isProcessing}
                className={`p-4 border-2 rounded-lg text-center transition-all ${
                  selectedQuestionType === 'codable_open'
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
                💡 For Essay/Written questions, use <strong>Question Groups</strong> mode above
              </p>
            </div>
          )}

          {/* File Upload — Multi-file */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload JSON Files *
            </label>
            <div className="flex gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                multiple
                onChange={handleFilesSelected}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isProcessing}
              />
              <button
                onClick={downloadTemplate}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 whitespace-nowrap"
                disabled={isProcessing}
              >
                📄 Template
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Select multiple files at once. Files will be processed in the order they were selected.
            </p>
          </div>

          {/* Upload Progress Bar */}
          {uploadProgress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-800">
                  Uploading file {uploadProgress.currentIndex} of {uploadProgress.total}
                </span>
                <span className="text-sm text-blue-600">
                  {Math.round((uploadProgress.currentIndex / uploadProgress.total) * 100)}%
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(uploadProgress.currentIndex / uploadProgress.total) * 100}%` }}
                />
              </div>
              {fileQueue.find(f => f.status === 'uploading') && (
                <p className="mt-1 text-xs text-blue-600">
                  Processing: {fileQueue.find(f => f.status === 'uploading')?.fileName}
                </p>
              )}
            </div>
          )}

          {/* File Queue List */}
          {fileQueue.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-700">
                  File Queue ({fileQueue.length})
                </span>
                {!isProcessing && !isUploadComplete && (
                  <button
                    onClick={clearQueue}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {fileQueue.map((file, index) => (
                  <div key={file.id}>
                    <div
                      className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                        file.status === 'uploading' ? 'bg-blue-50' :
                        file.status === 'success' ? 'bg-green-50/50' :
                        file.status === 'failed' ? 'bg-red-50/50' :
                        'hover:bg-gray-50'
                      }`}
                    >
                      {/* Order number */}
                      <span className="text-xs font-mono text-gray-400 w-5 text-right flex-shrink-0">
                        {index + 1}.
                      </span>

                      {/* Filename */}
                      <span className="flex-1 text-sm text-gray-800 font-medium truncate min-w-0">
                        {file.fileName}
                      </span>

                      {/* Question count */}
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {file.questionCount} {uploadMode === 'group' ? 'groups' : 'questions'}
                      </span>

                      {/* Upload result (if done) */}
                      {file.uploadResult && (
                        <span className="text-xs text-green-600 flex-shrink-0 font-medium">
                          {file.uploadResult.successful} ok
                          {file.uploadResult.failed > 0 && (
                            <span className="text-red-600 ml-1">{file.uploadResult.failed} fail</span>
                          )}
                        </span>
                      )}

                      {/* Status badge */}
                      <StatusBadge status={file.status} />

                      {/* Expand toggle for errors/warnings */}
                      {(file.errors.length > 0 || file.warnings.length > 0 || file.errorMessage) && (
                        <button
                          onClick={() => setExpandedFileId(expandedFileId === file.id ? null : file.id)}
                          className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                          title="Show details"
                        >
                          <svg className={`w-4 h-4 transition-transform ${expandedFileId === file.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      )}

                      {/* Remove button */}
                      {!isProcessing && file.status !== 'success' && file.status !== 'uploading' && (
                        <button
                          onClick={() => removeFile(file.id)}
                          className="text-gray-400 hover:text-red-500 flex-shrink-0"
                          title="Remove file"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Expanded details */}
                    {expandedFileId === file.id && (
                      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
                        {file.errorMessage && (
                          <p className="text-xs text-red-600 mb-1">Error: {file.errorMessage}</p>
                        )}
                        {file.errors.length > 0 && (
                          <div className="mb-1">
                            <p className="text-xs font-medium text-red-700 mb-0.5">Validation errors:</p>
                            <ul className="text-xs text-red-600 space-y-0.5 max-h-24 overflow-y-auto">
                              {file.errors.slice(0, 5).map((err, i) => (
                                <li key={i}>• {err}</li>
                              ))}
                              {file.errors.length > 5 && (
                                <li className="font-medium">... and {file.errors.length - 5} more</li>
                              )}
                            </ul>
                          </div>
                        )}
                        {file.warnings.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-yellow-700 mb-0.5">Warnings:</p>
                            <ul className="text-xs text-yellow-600 space-y-0.5 max-h-24 overflow-y-auto">
                              {file.warnings.slice(0, 5).map((w, i) => (
                                <li key={i}>• {w}</li>
                              ))}
                              {file.warnings.length > 5 && (
                                <li className="font-medium">... and {file.warnings.length - 5} more</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Upload History */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setHistoryExpanded(prev => !prev)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-gray-700">Recent Uploads</span>
                {!loadingHistory && importHistory.length > 0 && (
                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    {importHistory.length}
                  </span>
                )}
              </div>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${historyExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {historyExpanded && (
              <div className="divide-y divide-gray-100">
                {loadingHistory ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500">
                    <svg className="animate-spin h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Loading history...
                  </div>
                ) : importHistory.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-400 italic">
                    No uploads yet. Import your first file to see history here.
                  </div>
                ) : (
                  importHistory.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                      title={formatDateTime(record.created_at)}
                    >
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="flex-1 text-sm text-gray-800 font-medium truncate min-w-0">
                        {record.filename || 'Unknown file'}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                        {formatRelativeTime(record.created_at)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full flex-shrink-0">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {record.successful_imports}
                      </span>
                      {record.failed_imports > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full flex-shrink-0">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          {record.failed_imports}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Info Box - Type-specific requirements */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-800 mb-2">
              📋 JSON Format Requirements ({selectedQuestionType === 'mcq' ? 'MCQ' : selectedQuestionType === 'codable_open' ? 'Short Answer' : 'Question Group'})
            </h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Must be an array of question objects</li>
              <li>• All questions must have question_type: &quot;{selectedQuestionType}&quot;</li>
              {selectedQuestionType === 'mcq' && (
                <>
                  <li>• Required: question_text, option_a, option_b, option_c, option_d, option_e, correct_answer</li>
                  <li>• Correct answer must be A, B, C, D, or E</li>
                </>
              )}
              {selectedQuestionType === 'codable_open' && (
                <>
                  <li>• Required: question_text, correct_answer</li>
                  <li>• Optional: answer_keywords (array), max_points, sample_answer</li>
                </>
              )}
              {selectedQuestionType === 'written_open' && (
                <>
                  <li>• Required: question_text, grading_rubric (with criteria array)</li>
                  <li>• Each criterion needs: id, name, description, max_points</li>
                  <li>• Optional: sample_answer</li>
                  <li>⚠️ Written questions are excluded from practice sessions</li>
                </>
              )}
              <li>• Optional: explanation, difficulty (easy/medium/hard), topic, subtopic (must match a subtopic name under the given topic)</li>
              <li>• Optional: tags (array), source, year, question_image_url</li>
              <li>• Questions can be in any language (Azerbaijani, English, etc.)</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            disabled={isProcessing}
          >
            {isUploadComplete ? 'Close' : 'Cancel'}
          </button>
          {!isUploadComplete && (
            <button
              onClick={handleUpload}
              disabled={isProcessing || !selectedSubject || validFileCount === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isProcessing
                ? `Uploading ${uploadProgress ? `${uploadProgress.currentIndex}/${uploadProgress.total}` : '...'}`
                : `Upload ${validFileCount} File${validFileCount !== 1 ? 's' : ''}`
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
