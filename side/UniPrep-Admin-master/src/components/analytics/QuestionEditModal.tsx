'use client';

import React, { useState, useEffect } from 'react';
import { questionService } from '@/services/questionService';

interface Props {
  questionId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function QuestionEditModal({ questionId, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<any>(null);

  // Editable fields
  const [questionType, setQuestionType] = useState<'mcq' | 'codable_open' | 'written_open'>('mcq');
  const [questionText, setQuestionText] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState(''); // letter for MCQ, text for open types
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [optionE, setOptionE] = useState('');
  const [explanation, setExplanation] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [topic, setTopic] = useState('');

  useEffect(() => {
    if (questionId) {
      loadQuestion(questionId);
    }
  }, [questionId]);

  const loadQuestion = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const result = await questionService.getQuestionById(id);
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Question not found');
      }
      const q = result.data;
      setQuestion(q);
      setQuestionType(q.question_type || 'mcq');
      setQuestionText(q.question_text || '');
      setCorrectAnswer(q.correct_answer || '');
      setOptionA(q.option_a || '');
      setOptionB(q.option_b || '');
      setOptionC(q.option_c || '');
      setOptionD(q.option_d || '');
      setOptionE(q.option_e || '');
      setExplanation(q.explanation || '');
      setDifficulty(q.difficulty || '');
      setTopic(q.topic || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load question');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!questionId) return;
    try {
      setSaving(true);
      setError(null);

      const updates: Record<string, string> = {
        question_text: questionText,
        correct_answer: correctAnswer,
        option_a: optionA,
        option_b: optionB,
        option_c: optionC,
        option_d: optionD,
        explanation: explanation,
        difficulty: difficulty,
        topic: topic,
      };

      if (optionE.trim()) {
        updates.option_e = optionE;
      }

      const result = await questionService.updateQuestion(questionId, updates);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update');
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!questionId) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Edit Question</h2>
              {question && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  questionType === 'mcq'           ? 'bg-blue-100 text-blue-700'   :
                  questionType === 'codable_open'  ? 'bg-purple-100 text-purple-700' :
                                                    'bg-orange-100 text-orange-700'
                }`}>
                  {questionType === 'mcq' ? 'MCQ' : questionType === 'codable_open' ? 'Codable' : 'Written Open'}
                </span>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
              <p className="text-gray-500 mt-3">Loading question...</p>
            </div>
          ) : error && !question ? (
            <div className="p-12 text-center">
              <p className="text-red-600">{error}</p>
              <button onClick={onClose} className="mt-3 text-blue-600 hover:text-blue-800">Close</button>
            </div>
          ) : (
            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>
              )}

              {/* Current Answer info — read-only snapshot from DB */}
              {question && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-semibold text-blue-900">Current Database Values</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <div>
                      <span className="text-blue-700 font-medium">
                        {questionType === 'mcq' ? 'Correct Answer: ' : questionType === 'codable_open' ? 'Expected Answer: ' : 'Model Answer: '}
                      </span>
                      {questionType === 'mcq' ? (
                        <>
                          <span className="text-blue-900 font-bold">{question.correct_answer}</span>
                          {question.correct_answer && question[`option_${question.correct_answer.toLowerCase()}` as keyof typeof question] && (
                            <span className="text-blue-800 ml-2">
                              — {String(question[`option_${question.correct_answer.toLowerCase()}` as keyof typeof question])}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-blue-800">{question.correct_answer || <em className="text-blue-400">not set</em>}</span>
                      )}
                    </div>
                    {question.explanation && (
                      <div>
                        <span className="text-blue-700 font-medium">Explanation: </span>
                        <span className="text-blue-800">{question.explanation}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Question Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                />
              </div>

              {/* Options grid — MCQ only */}
              {questionType === 'mcq' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(
                    [
                      { key: 'A', label: 'Option A', value: optionA, setter: setOptionA },
                      { key: 'B', label: 'Option B', value: optionB, setter: setOptionB },
                      { key: 'C', label: 'Option C', value: optionC, setter: setOptionC },
                      { key: 'D', label: 'Option D', value: optionD, setter: setOptionD },
                      { key: 'E', label: 'Option E (optional)', value: optionE, setter: setOptionE },
                    ] as const
                  ).map((opt) => {
                    const isCorrect = correctAnswer === opt.key;
                    return (
                      <div key={opt.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {opt.label}
                          {isCorrect && (
                            <span className="ml-2 text-green-600 text-xs font-bold">✓ CORRECT</span>
                          )}
                        </label>
                        <input
                          type="text"
                          className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${
                            isCorrect ? 'border-green-400 bg-green-50' : 'border-gray-300'
                          }`}
                          value={opt.value}
                          onChange={(e) => opt.setter(e.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Correct Answer */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {questionType === 'mcq' ? 'Correct Answer' : questionType === 'codable_open' ? 'Expected Answer' : 'Model Answer / Grading Criteria'}
                </label>

                {questionType === 'mcq' ? (
                  // MCQ: letter-based select — value is "A"/"B"/"C"/"D"/"E"
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    value={correctAnswer}
                    onChange={(e) => setCorrectAnswer(e.target.value)}
                  >
                    <option value="">Select correct answer</option>
                    {optionA && <option value="A">A: {optionA.slice(0, 70)}</option>}
                    {optionB && <option value="B">B: {optionB.slice(0, 70)}</option>}
                    {optionC && <option value="C">C: {optionC.slice(0, 70)}</option>}
                    {optionD && <option value="D">D: {optionD.slice(0, 70)}</option>}
                    {optionE && <option value="E">E: {optionE.slice(0, 70)}</option>}
                  </select>
                ) : questionType === 'codable_open' ? (
                  // Codable open: expected answer is a code/text string
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                    rows={3}
                    value={correctAnswer}
                    onChange={(e) => setCorrectAnswer(e.target.value)}
                    placeholder="Expected answer or accepted keywords..."
                  />
                ) : (
                  // Written open: model answer / grading criteria
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    rows={4}
                    value={correctAnswer}
                    onChange={(e) => setCorrectAnswer(e.target.value)}
                    placeholder="Model answer, key points expected, or grading criteria..."
                  />
                )}
              </div>

              {/* Explanation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Explanation</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Explain why the correct answer is correct..."
                />
              </div>

              {/* Metadata row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !questionText.trim() || (questionType === 'mcq' && !correctAnswer)}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
