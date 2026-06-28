"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BookmarkCheck, Trash2, BookOpen } from "lucide-react"
import { CardSkeleton } from "@/components/ui/skeleton"

interface BookmarkedQuestion {
  id: string
  question_id: string
  created_at: string
  questions: {
    id: string
    question_text: string
    option_a: string
    option_b: string
    option_c: string
    option_d: string
    option_e: string
    correct_answer: string
    difficulty: string
    subject_topics: {
      subjects: {
        name: string
      }
    }
  }
}

export default function BookmarksPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [bookmarks, setBookmarks] = useState<BookmarkedQuestion[]>([])
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadBookmarks()
  }, [])

  const loadBookmarks = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      const { data: bookmarksData } = await supabase
        .from("bookmarked_questions")
        .select(`
          *,
          questions(
            id,
            question_text,
            option_a,
            option_b,
            option_c,
            option_d,
            option_e,
            correct_answer,
            difficulty,
            subject_topics(
              subjects(name)
            )
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (bookmarksData) {
        setBookmarks(bookmarksData)
      }
    } catch (error) {
      console.error("Error loading bookmarks:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveBookmark = async (bookmarkId: string) => {
    try {
      const supabase = createClient()
      await supabase
        .from("bookmarked_questions")
        .delete()
        .eq("id", bookmarkId)

      setBookmarks(bookmarks.filter(b => b.id !== bookmarkId))
    } catch (error) {
      console.error("Error removing bookmark:", error)
    }
  }

  const toggleQuestion = (questionId: string) => {
    const newExpanded = new Set(expandedQuestions)
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId)
    } else {
      newExpanded.add(questionId)
    }
    setExpandedQuestions(newExpanded)
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty?.toLowerCase()) {
      case 'easy':
        return 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
      case 'medium':
        return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
      case 'hard':
        return 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-8 animate-pulse"></div>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Bookmarked Questions
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {bookmarks.length} question{bookmarks.length !== 1 ? 's' : ''} saved for review
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push('/student/practice')}
            >
              Back to Practice
            </Button>
          </div>
        </div>

        {/* Bookmarks List */}
        {bookmarks.length === 0 ? (
          <Card className="p-12 text-center bg-white dark:bg-gray-800">
            <BookmarkCheck className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No bookmarks yet
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Bookmark questions while practicing to review them later
            </p>
            <Button
              onClick={() => router.push('/student/practice')}
              className="bg-blue-900 hover:bg-blue-800 text-white"
            >
              Start Practicing
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {bookmarks.map((bookmark) => {
              const isExpanded = expandedQuestions.has(bookmark.question_id)
              const question = bookmark.questions

              return (
                <Card
                  key={bookmark.id}
                  className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getDifficultyColor(question.difficulty)}`}>
                          {question.difficulty || 'Medium'}
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {question.subject_topics?.subjects?.name || 'Subject'}
                        </span>
                      </div>
                      <p className="text-gray-900 dark:text-white">
                        {question.question_text}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveBookmark(bookmark.id)}
                      className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="space-y-2 mb-4">
                      {(['A', 'B', 'C', 'D', 'E'] as const).map((option) => {
                        const isCorrect = option === question.correct_answer
                        
                        return (
                          <div
                            key={option}
                            className={`p-3 rounded-lg border-2 ${
                              isCorrect
                                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                : 'border-gray-200 dark:border-gray-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <span className="font-bold text-gray-900 dark:text-white mr-3">
                                  {option}.
                                </span>
                                <span className="text-gray-900 dark:text-white">
                                  {question[`option_${option.toLowerCase()}` as keyof typeof question]}
                                </span>
                              </div>
                              {isCorrect && (
                                <span className="text-xs font-medium text-green-600 dark:text-green-400">
                                  Correct Answer
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleQuestion(bookmark.question_id)}
                    className="text-blue-900 dark:text-blue-400"
                  >
                    {isExpanded ? 'Hide' : 'Show'} Answer
                  </Button>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
