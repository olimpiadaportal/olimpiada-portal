-- Hotfix 79: Fix uses_teacher_questions flag for existing teacher exams
-- Root cause: teacherExamService.ts was only setting this flag=TRUE if the exam
-- contained at least one teacher-created question, but ALL teacher exam questions
-- are stored in teacher_exam_questions regardless of source (Elmly or teacher-created).
-- This caused admin RPC to query mock_exam_questions instead and return 0 results.

UPDATE mock_exams
SET uses_teacher_questions = TRUE
WHERE created_by_teacher IS NOT NULL
  AND uses_teacher_questions = FALSE;
