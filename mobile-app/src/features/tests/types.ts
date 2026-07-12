// TEST ENGINE (M3) — shared types mirroring the WEB contract exactly
// (web-app/src/lib/auth/testActions.ts + TestRunner.tsx + the 011/037/047 RPC
// payloads). The RPCs never expose is_correct before grading; only the review
// payload (graded attempts, owner only) carries answer keys.

// ---- get_test_attempt payload -------------------------------------------------

export type TestOption = { option_id: string; text: string | null };

export type TestQuestion = {
  question_id: string;
  type: string | null;
  topic_id: string | null;
  body: string | null;
  prompt: string | null;
  selected_option_ids: string[];
  is_marked: boolean;
  options: TestOption[];
};

export type TestAttemptData = {
  attempt_id: string;
  status: string;
  /** 'test' | 'olympiad' — the shared runner derives wording/exit from this. */
  kind: string;
  subject_id: string;
  deadline_at: string | null;
  duration_seconds: number | null;
  /** Server-computed remaining seconds at fetch time — the timer's truth. */
  remaining_seconds: number | null;
  score: number | null;
  max_score: number | null;
  questions: TestQuestion[];
};

/** Names resolved OUTSIDE the RPC payload (subject/topic/package labels). */
export type AttemptMeta = {
  subjectName: string;
  topicNames: string[];
  /** Olympiad package title (locale/az fallback) — null for kind='test'. */
  olympiadTitle: string | null;
};

// ---- save/submit payloads -------------------------------------------------------

export type AnswerItem = {
  question_id: string;
  selected_option_ids: string[];
  is_marked?: boolean;
  time_spent_ms?: number;
};

export type SaveResult =
  | { ok: true; remaining: number | null }
  | { ok: false; deadline: boolean };

// ---- start_topic_test_attempt -----------------------------------------------------

export type StartTestData = {
  attempt_id: string;
  resumed: boolean;
  deadline_at: string | null;
  duration_seconds: number | null;
  count?: number;
};

export type StartTestResult =
  | { ok: true; data: StartTestData }
  | { ok: false; errorKey: string };

// ---- submit_test_attempt / test_attempt_result ------------------------------------

export type TopicRow = {
  topic_id: string | null;
  name: string | null;
  total: number;
  correct: number;
};

export type ResultPayload = {
  attempt_id: string;
  status: string;
  score: number | null;
  max: number | null;
  submitted_at: string | null;
  results: { question_id: string; is_correct: boolean | null }[];
  topics: TopicRow[];
};

// ---- get_test_review ---------------------------------------------------------------

export type ReviewOption = {
  option_id: string;
  text: string | null;
  is_correct: boolean;
};

export type ReviewQuestion = {
  question_id: string;
  body: string | null;
  prompt: string | null;
  is_correct: boolean | null;
  selected_option_ids: string[];
  explanation: string | null;
  options: ReviewOption[];
};

export type ReviewPayload = {
  attempt_id: string;
  score: number | null;
  max: number | null;
  questions: ReviewQuestion[];
};

// ---- app-side reads (tests home / setup / result guards) ---------------------------

export type ChildSubject = { id: string; name: string };

/** Mirror of web getChildSubjectAccess() (childSubjects.ts). */
export type SubjectAccess = {
  freeNow: boolean;
  access: string;
  hasAccess: boolean;
  subjects: ChildSubject[];
};

export type AttemptListRow = {
  id: string;
  status: string;
  score: number | null;
  max_score: number | null;
  started_at: string | null;
  submitted_at: string | null;
  deadline_at: string | null;
  subject_name: string | null;
};

export type SetupSubtopic = { id: string; name: string };
export type SetupTopic = { id: string; name: string; subtopics: SetupSubtopic[] };

/** Own test_attempts row — the result/review guards + time context. */
export type AttemptRowMeta = {
  id: string;
  kind: string;
  status: string;
  deadline_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  duration_seconds: number | null;
  subject_name: string | null;
};

/** Own test_attempt_answers rows post-grading (NO answer keys involved). */
export type BreakdownRow = {
  selected_option_ids: string[] | null;
  is_correct: boolean | null;
};
