-- ============================================================================
-- 08b_forum_tables.sql
-- Elmly Forum Q&A Feature Tables
-- Run AFTER 08_security_hardening.sql and BEFORE 09_verify.sql
-- ============================================================================
-- Created: March 7, 2026
-- Updated: March 8, 2026 - Fixed bookmark RLS policies (see Migration 37)
-- Purpose: Add community Q&A forum for users to discuss exam questions
-- ============================================================================

-- ============================================================================
-- SECTION 1: TABLES
-- ============================================================================

-- Forum categories (subjects, general, app-help, etc.)
CREATE TABLE IF NOT EXISTS forum_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_en TEXT NOT NULL,
    name_az TEXT NOT NULL,
    name_ru TEXT,
    slug TEXT UNIQUE NOT NULL,
    description_en TEXT,
    description_az TEXT,
    icon TEXT,
    color TEXT,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forum questions (the main posts)
CREATE TABLE IF NOT EXISTS forum_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES forum_categories(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    body_plain TEXT,
    slug TEXT UNIQUE NOT NULL,
    tags TEXT[] DEFAULT '{}',
    view_count INTEGER DEFAULT 0,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    answer_count INTEGER DEFAULT 0,
    accepted_answer_id UUID,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_closed BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    topic_id UUID REFERENCES subject_topics(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forum answers
CREATE TABLE IF NOT EXISTS forum_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES forum_questions(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    body_plain TEXT,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    is_accepted BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK constraint for accepted_answer_id after forum_answers exists
ALTER TABLE forum_questions 
    ADD CONSTRAINT fk_accepted_answer 
    FOREIGN KEY (accepted_answer_id) 
    REFERENCES forum_answers(id) 
    ON DELETE SET NULL;

-- Comments on questions or answers
CREATE TABLE IF NOT EXISTS forum_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    question_id UUID REFERENCES forum_questions(id) ON DELETE CASCADE,
    answer_id UUID REFERENCES forum_answers(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT comment_target CHECK (
        (question_id IS NOT NULL AND answer_id IS NULL) OR
        (question_id IS NULL AND answer_id IS NOT NULL)
    )
);

-- Vote tracking (prevents double-voting)
CREATE TABLE IF NOT EXISTS forum_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    question_id UUID REFERENCES forum_questions(id) ON DELETE CASCADE,
    answer_id UUID REFERENCES forum_answers(id) ON DELETE CASCADE,
    vote_type SMALLINT NOT NULL CHECK (vote_type IN (-1, 1)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT vote_target CHECK (
        (question_id IS NOT NULL AND answer_id IS NULL) OR
        (question_id IS NULL AND answer_id IS NOT NULL)
    ),
    CONSTRAINT unique_question_vote UNIQUE (user_id, question_id),
    CONSTRAINT unique_answer_vote UNIQUE (user_id, answer_id)
);

-- Bookmarked/saved questions
CREATE TABLE IF NOT EXISTS forum_bookmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES forum_questions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, question_id)
);

-- Forum reputation history (audit trail)
CREATE TABLE IF NOT EXISTS forum_reputation_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    change INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reference_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forum moderation log
CREATE TABLE IF NOT EXISTS forum_moderation_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    moderator_id UUID NOT NULL REFERENCES profiles(id),
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id UUID NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forum user stats (denormalized for performance)
CREATE TABLE IF NOT EXISTS forum_user_stats (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    reputation INTEGER DEFAULT 0,
    questions_asked INTEGER DEFAULT 0,
    answers_given INTEGER DEFAULT 0,
    answers_accepted INTEGER DEFAULT 0,
    helpful_votes INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forum tags (for autocomplete and management)
CREATE TABLE IF NOT EXISTS forum_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 2: ADD FORUM REPUTATION TO PROFILES
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS forum_reputation INTEGER DEFAULT 0;

-- ============================================================================
-- SECTION 3: INDEXES
-- ============================================================================

-- Categories
CREATE INDEX IF NOT EXISTS idx_forum_categories_slug ON forum_categories(slug);
CREATE INDEX IF NOT EXISTS idx_forum_categories_active ON forum_categories(is_active, display_order);

-- Questions
CREATE INDEX IF NOT EXISTS idx_forum_questions_author ON forum_questions(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_questions_category ON forum_questions(category_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_questions_slug ON forum_questions(slug);
CREATE INDEX IF NOT EXISTS idx_forum_questions_created ON forum_questions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_questions_activity ON forum_questions(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_questions_votes ON forum_questions(upvotes DESC);
CREATE INDEX IF NOT EXISTS idx_forum_questions_unanswered ON forum_questions(answer_count, created_at DESC) WHERE answer_count = 0;
CREATE INDEX IF NOT EXISTS idx_forum_questions_tags ON forum_questions USING GIN(tags);

-- Full-text search on questions. Keep the text search configuration aligned
-- with search_forum_question_ids().
CREATE INDEX IF NOT EXISTS idx_forum_questions_search ON forum_questions 
    USING GIN (to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(body_plain, '')));

-- Answers
CREATE INDEX IF NOT EXISTS idx_forum_answers_question ON forum_answers(question_id, created_at);
CREATE INDEX IF NOT EXISTS idx_forum_answers_author ON forum_answers(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_answers_accepted ON forum_answers(question_id) WHERE is_accepted = TRUE;

-- Comments
CREATE INDEX IF NOT EXISTS idx_forum_comments_question ON forum_comments(question_id);
CREATE INDEX IF NOT EXISTS idx_forum_comments_answer ON forum_comments(answer_id);

-- Votes
CREATE INDEX IF NOT EXISTS idx_forum_votes_user ON forum_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_votes_question ON forum_votes(question_id);
CREATE INDEX IF NOT EXISTS idx_forum_votes_answer ON forum_votes(answer_id);

-- Bookmarks
CREATE INDEX IF NOT EXISTS idx_forum_bookmarks_user ON forum_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_bookmarks_question ON forum_bookmarks(question_id);
CREATE INDEX IF NOT EXISTS idx_forum_bookmarks_user_question ON forum_bookmarks(user_id, question_id);

-- Tags
CREATE INDEX IF NOT EXISTS idx_forum_tags_usage ON forum_tags(usage_count DESC);

-- ============================================================================
-- SECTION 4: ROLE HIERARCHY & HELPER FUNCTIONS
-- ============================================================================
-- Role Hierarchy (Principle of Least Privilege):
--   super_admin > admin > moderator > teacher > student
--
-- Permissions Matrix:
-- | Action                    | super_admin | admin | moderator | teacher | student |
-- |---------------------------|-------------|-------|-----------|---------|----------|
-- | Manage categories         | ✓           | ✓     | ✗         | ✗       | ✗        |
-- | Pin/close questions       | ✓           | ✓     | ✓         | ✗       | ✗        |
-- | Delete any content        | ✓           | ✓     | ✓         | ✗       | ✗        |
-- | Edit any content          | ✓           | ✓     | ✗         | ✗       | ✗        |
-- | View moderation log       | ✓           | ✓     | ✓         | ✗       | ✗        |
-- | Create moderation log     | ✓           | ✓     | ✓         | ✗       | ✗        |
-- | Verified answer badge     | ✗           | ✗     | ✗         | ✓       | ✗        |
-- | Ask/answer questions      | ✓           | ✓     | ✓         | ✓       | ✓        |
-- | Vote on content           | ✓           | ✓     | ✓         | ✓       | ✓        |
-- | Bookmark questions        | ✓           | ✓     | ✓         | ✓       | ✓        |
-- ============================================================================

-- Helper function: Check if user is an admin (any level)
CREATE OR REPLACE FUNCTION is_forum_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins 
    WHERE user_id = user_uuid 
    AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function: Check if user is moderator or higher
CREATE OR REPLACE FUNCTION is_forum_moderator(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins 
    WHERE user_id = user_uuid 
    AND is_active = TRUE
    AND role IN ('super_admin', 'admin', 'moderator')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function: Check if user is admin or super_admin (not just moderator)
CREATE OR REPLACE FUNCTION is_forum_admin_or_higher(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins 
    WHERE user_id = user_uuid 
    AND is_active = TRUE
    AND role IN ('super_admin', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function: Check if user is a teacher
CREATE OR REPLACE FUNCTION is_forum_teacher(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = user_uuid 
    AND user_type = 'teacher'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function: Get user's forum role for display
CREATE OR REPLACE FUNCTION get_forum_role(user_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  admin_role_val admin_role;
  user_type_val TEXT;
BEGIN
  -- Check admin table first
  SELECT role INTO admin_role_val
  FROM admins
  WHERE user_id = user_uuid AND is_active = TRUE;
  
  IF admin_role_val IS NOT NULL THEN
    RETURN admin_role_val::TEXT;
  END IF;
  
  -- Check profile user_type
  SELECT user_type INTO user_type_val
  FROM profiles
  WHERE id = user_uuid;
  
  RETURN COALESCE(user_type_val, 'student');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- SECTION 5: RLS POLICIES
-- ============================================================================

-- Enable RLS on all forum tables
ALTER TABLE forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_bookmarks FORCE ROW LEVEL SECURITY;
ALTER TABLE forum_reputation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_moderation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_tags ENABLE ROW LEVEL SECURITY;

-- Categories: public read
CREATE POLICY "Anyone can view active categories"
    ON forum_categories FOR SELECT
    USING (is_active = TRUE);

CREATE POLICY "Admins can manage categories"
    ON forum_categories FOR ALL
    TO authenticated
    USING (is_forum_admin_or_higher(auth.uid()));

-- Questions: public read, authenticated write
CREATE POLICY "Anyone can view non-deleted questions"
    ON forum_questions FOR SELECT
    USING (NOT is_deleted);

CREATE POLICY "Authenticated users can create questions"
    ON forum_questions FOR INSERT
    TO authenticated
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can update own questions"
    ON forum_questions FOR UPDATE
    TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can soft-delete own questions"
    ON forum_questions FOR UPDATE
    TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid() AND is_deleted = TRUE);

-- Moderators can update any question (pin, close, delete)
CREATE POLICY "Moderators can manage questions"
    ON forum_questions FOR UPDATE
    TO authenticated
    USING (is_forum_moderator(auth.uid()));

-- Admins can hard delete questions
CREATE POLICY "Admins can delete questions"
    ON forum_questions FOR DELETE
    TO authenticated
    USING (is_forum_admin_or_higher(auth.uid()));

-- Answers: public read, authenticated write
CREATE POLICY "Anyone can view non-deleted answers"
    ON forum_answers FOR SELECT
    USING (NOT is_deleted);

CREATE POLICY "Authenticated users can create answers"
    ON forum_answers FOR INSERT
    TO authenticated
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can update own answers"
    ON forum_answers FOR UPDATE
    TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

-- Moderators can update any answer (delete)
CREATE POLICY "Moderators can manage answers"
    ON forum_answers FOR UPDATE
    TO authenticated
    USING (is_forum_moderator(auth.uid()));

-- Admins can hard delete answers
CREATE POLICY "Admins can delete answers"
    ON forum_answers FOR DELETE
    TO authenticated
    USING (is_forum_admin_or_higher(auth.uid()));

-- Comments: public read, authenticated write
CREATE POLICY "Anyone can view non-deleted comments"
    ON forum_comments FOR SELECT
    USING (NOT is_deleted);

CREATE POLICY "Authenticated users can create comments"
    ON forum_comments FOR INSERT
    TO authenticated
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can update own comments"
    ON forum_comments FOR UPDATE
    TO authenticated
    USING (author_id = auth.uid());

-- Votes: users can manage own votes
CREATE POLICY "Users can view own votes"
    ON forum_votes FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can create votes"
    ON forum_votes FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own votes"
    ON forum_votes FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete own votes"
    ON forum_votes FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- Bookmarks: users can manage own bookmarks
-- Drop existing policies first to ensure clean state (fixes 406 errors)
DROP POLICY IF EXISTS "Users can view own bookmarks" ON forum_bookmarks;
DROP POLICY IF EXISTS "Users can create bookmarks" ON forum_bookmarks;
DROP POLICY IF EXISTS "Users can delete own bookmarks" ON forum_bookmarks;
DROP POLICY IF EXISTS "Anyone can view bookmarks" ON forum_bookmarks;

CREATE POLICY "Users can view own bookmarks"
    ON forum_bookmarks FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can create bookmarks"
    ON forum_bookmarks FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own bookmarks"
    ON forum_bookmarks FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- Reputation log: users can view own, admins can view all
CREATE POLICY "Users can view own reputation log"
    ON forum_reputation_log FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Moderation log: moderators and above
CREATE POLICY "Moderators can view moderation log"
    ON forum_moderation_log FOR SELECT
    TO authenticated
    USING (is_forum_moderator(auth.uid()));

CREATE POLICY "Moderators can create moderation log"
    ON forum_moderation_log FOR INSERT
    TO authenticated
    WITH CHECK (is_forum_moderator(auth.uid()));

-- User stats: public read
CREATE POLICY "Anyone can view user stats"
    ON forum_user_stats FOR SELECT
    USING (TRUE);

CREATE POLICY "System can manage user stats"
    ON forum_user_stats FOR ALL
    TO service_role
    USING (TRUE);

-- Tags: public read
CREATE POLICY "Anyone can view tags"
    ON forum_tags FOR SELECT
    USING (TRUE);

-- ============================================================================
-- SECTION 5: SEED DATA - DEFAULT CATEGORIES
-- ============================================================================

INSERT INTO forum_categories (name_en, name_az, slug, description_en, description_az, icon, color, display_order) VALUES
    ('General Discussion', 'Ümumi Müzakirə', 'general', 'General questions and discussions', 'Ümumi suallar və müzakirələr', 'message-square', '#6366f1', 1),
    ('Mathematics', 'Riyaziyyat', 'mathematics', 'Math problems and solutions', 'Riyaziyyat məsələləri və həlləri', 'calculator', '#ef4444', 2),
    ('Physics', 'Fizika', 'physics', 'Physics questions and concepts', 'Fizika sualları və konseptləri', 'atom', '#f97316', 3),
    ('Chemistry', 'Kimya', 'chemistry', 'Chemistry questions and reactions', 'Kimya sualları və reaksiyalar', 'flask-conical', '#22c55e', 4),
    ('Biology', 'Biologiya', 'biology', 'Biology and life sciences', 'Biologiya və həyat elmləri', 'leaf', '#10b981', 5),
    ('History', 'Tarix', 'history', 'History questions and events', 'Tarix sualları və hadisələr', 'landmark', '#8b5cf6', 6),
    ('Geography', 'Coğrafiya', 'geography', 'Geography and world studies', 'Coğrafiya və dünya araşdırmaları', 'globe', '#06b6d4', 7),
    ('Languages', 'Dillər', 'languages', 'Language learning and grammar', 'Dil öyrənmə və qrammatika', 'languages', '#ec4899', 8),
    ('Study Tips', 'Oxu Məsləhətləri', 'study-tips', 'Study strategies and exam preparation', 'Oxu strategiyaları və imtahana hazırlıq', 'lightbulb', '#eab308', 9),
    ('App Help', 'Tətbiq Yardımı', 'app-help', 'Questions about using Elmly', 'Elmly istifadəsi haqqında suallar', 'help-circle', '#64748b', 10)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SECTION 6: NOTIFICATION EVENTS FOR FORUM
-- ============================================================================

INSERT INTO notification_events (event_type, event_name, description, enabled, channels) VALUES
    ('forum_answer_received', 'New Answer', 'Someone answered your question', TRUE, ARRAY['push', 'in_app']),
    ('forum_answer_accepted', 'Answer Accepted', 'Your answer was accepted', TRUE, ARRAY['push', 'in_app']),
    ('forum_answer_upvoted', 'Answer Upvoted', 'Your answer received an upvote', TRUE, ARRAY['in_app']),
    ('forum_mention', 'Mentioned', 'Someone mentioned you in a post', TRUE, ARRAY['push', 'in_app']),
    ('forum_comment_received', 'New Comment', 'Someone commented on your post', TRUE, ARRAY['in_app'])
ON CONFLICT (event_type) DO NOTHING;

-- ============================================================================
-- SECTION 7: HELPER FUNCTIONS
-- ============================================================================

-- Function to update question answer count
CREATE OR REPLACE FUNCTION update_forum_question_answer_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE forum_questions 
        SET answer_count = answer_count + 1,
            last_activity_at = NOW()
        WHERE id = NEW.question_id;
    ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE) THEN
        UPDATE forum_questions 
        SET answer_count = GREATEST(0, answer_count - 1)
        WHERE id = COALESCE(NEW.question_id, OLD.question_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for answer count
DROP TRIGGER IF EXISTS trg_forum_answer_count ON forum_answers;
CREATE TRIGGER trg_forum_answer_count
    AFTER INSERT OR UPDATE OR DELETE ON forum_answers
    FOR EACH ROW
    EXECUTE FUNCTION update_forum_question_answer_count();

-- Function to update tag usage count
CREATE OR REPLACE FUNCTION update_forum_tag_usage()
RETURNS TRIGGER AS $$
DECLARE
    tag TEXT;
BEGIN
    -- Handle new tags
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        FOREACH tag IN ARRAY COALESCE(NEW.tags, '{}')
        LOOP
            INSERT INTO forum_tags (name, usage_count)
            VALUES (tag, 1)
            ON CONFLICT (name) DO UPDATE SET usage_count = forum_tags.usage_count + 1;
        END LOOP;
    END IF;
    
    -- Handle removed tags (on update)
    IF TG_OP = 'UPDATE' THEN
        FOREACH tag IN ARRAY COALESCE(OLD.tags, '{}')
        LOOP
            IF NOT (tag = ANY(COALESCE(NEW.tags, '{}'))) THEN
                UPDATE forum_tags SET usage_count = GREATEST(0, usage_count - 1) WHERE name = tag;
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for tag usage
DROP TRIGGER IF EXISTS trg_forum_tag_usage ON forum_questions;
CREATE TRIGGER trg_forum_tag_usage
    AFTER INSERT OR UPDATE ON forum_questions
    FOR EACH ROW
    EXECUTE FUNCTION update_forum_tag_usage();

-- Atomic RPC: increment a question view count.
CREATE OR REPLACE FUNCTION increment_forum_question_view(p_question_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_view_count INTEGER;
BEGIN
    UPDATE forum_questions
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE id = p_question_id
      AND is_deleted = FALSE
    RETURNING view_count INTO v_view_count;

    RETURN COALESCE(v_view_count, 0);
END;
$$;

-- Atomic RPC: create an answer through a single server-side operation.
-- The answer-count trigger updates forum_questions.answer_count and last_activity_at.
CREATE OR REPLACE FUNCTION create_forum_answer(
    p_question_id UUID,
    p_body TEXT,
    p_body_plain TEXT
)
RETURNS SETOF forum_answers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_answer forum_answers;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM forum_questions
        WHERE id = p_question_id
          AND is_deleted = FALSE
          AND is_closed = FALSE
    ) THEN
        RAISE EXCEPTION 'Question is not available for answers';
    END IF;

    INSERT INTO forum_answers (question_id, author_id, body, body_plain)
    VALUES (p_question_id, v_user_id, p_body, p_body_plain)
    RETURNING * INTO v_answer;

    RETURN NEXT v_answer;
END;
$$;

-- Atomic RPC: create, change, or remove a vote and update counters safely.
CREATE OR REPLACE FUNCTION vote_forum_content(
    p_target_type TEXT,
    p_target_id UUID,
    p_vote_type SMALLINT
)
RETURNS TABLE(upvotes INTEGER, downvotes INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_existing_vote forum_votes;
    v_up_delta INTEGER := 0;
    v_down_delta INTEGER := 0;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated';
    END IF;

    IF p_vote_type NOT IN (-1, 1) THEN
        RAISE EXCEPTION 'Invalid vote type';
    END IF;

    IF p_target_type = 'question' THEN
        PERFORM 1
        FROM forum_questions
        WHERE id = p_target_id
          AND is_deleted = FALSE
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Question not found';
        END IF;

        SELECT *
        INTO v_existing_vote
        FROM forum_votes
        WHERE user_id = v_user_id
          AND question_id = p_target_id
        FOR UPDATE;
    ELSIF p_target_type = 'answer' THEN
        PERFORM 1
        FROM forum_answers
        WHERE id = p_target_id
          AND is_deleted = FALSE
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Answer not found';
        END IF;

        SELECT *
        INTO v_existing_vote
        FROM forum_votes
        WHERE user_id = v_user_id
          AND answer_id = p_target_id
        FOR UPDATE;
    ELSE
        RAISE EXCEPTION 'Invalid target type';
    END IF;

    IF v_existing_vote.id IS NOT NULL THEN
        IF v_existing_vote.vote_type = p_vote_type THEN
            DELETE FROM forum_votes WHERE id = v_existing_vote.id;
            IF p_vote_type = 1 THEN
                v_up_delta := -1;
            ELSE
                v_down_delta := -1;
            END IF;
        ELSE
            UPDATE forum_votes
            SET vote_type = p_vote_type
            WHERE id = v_existing_vote.id;

            IF v_existing_vote.vote_type = 1 THEN
                v_up_delta := -1;
                v_down_delta := 1;
            ELSE
                v_up_delta := 1;
                v_down_delta := -1;
            END IF;
        END IF;
    ELSE
        IF p_target_type = 'question' THEN
            INSERT INTO forum_votes (user_id, question_id, vote_type)
            VALUES (v_user_id, p_target_id, p_vote_type);
        ELSE
            INSERT INTO forum_votes (user_id, answer_id, vote_type)
            VALUES (v_user_id, p_target_id, p_vote_type);
        END IF;

        IF p_vote_type = 1 THEN
            v_up_delta := 1;
        ELSE
            v_down_delta := 1;
        END IF;
    END IF;

    IF p_target_type = 'question' THEN
        UPDATE forum_questions
        SET upvotes = GREATEST(0, COALESCE(forum_questions.upvotes, 0) + v_up_delta),
            downvotes = GREATEST(0, COALESCE(forum_questions.downvotes, 0) + v_down_delta)
        WHERE id = p_target_id
        RETURNING forum_questions.upvotes, forum_questions.downvotes
        INTO upvotes, downvotes;
    ELSE
        UPDATE forum_answers
        SET upvotes = GREATEST(0, COALESCE(forum_answers.upvotes, 0) + v_up_delta),
            downvotes = GREATEST(0, COALESCE(forum_answers.downvotes, 0) + v_down_delta)
        WHERE id = p_target_id
        RETURNING forum_answers.upvotes, forum_answers.downvotes
        INTO upvotes, downvotes;
    END IF;

    RETURN NEXT;
END;
$$;

-- Atomic RPC: accept an answer and update reputation consistently.
CREATE OR REPLACE FUNCTION accept_forum_answer(
    p_question_id UUID,
    p_answer_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_old_answer_id UUID;
    v_old_author_id UUID;
    v_new_author_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated';
    END IF;

    SELECT accepted_answer_id
    INTO v_old_answer_id
    FROM forum_questions
    WHERE id = p_question_id
      AND is_deleted = FALSE
      AND (author_id = v_user_id OR is_forum_moderator(v_user_id))
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Question not found or not owned by caller';
    END IF;

    SELECT author_id
    INTO v_new_author_id
    FROM forum_answers
    WHERE id = p_answer_id
      AND question_id = p_question_id
      AND is_deleted = FALSE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Answer not found for question';
    END IF;

    IF v_old_answer_id IS NOT NULL AND v_old_answer_id <> p_answer_id THEN
        SELECT author_id INTO v_old_author_id FROM forum_answers WHERE id = v_old_answer_id;

        UPDATE forum_answers
        SET is_accepted = FALSE,
            updated_at = NOW()
        WHERE id = v_old_answer_id;

        IF v_old_author_id IS NOT NULL THEN
            UPDATE profiles
            SET forum_reputation = GREATEST(0, COALESCE(forum_reputation, 0) - 15)
            WHERE id = v_old_author_id;

            UPDATE forum_user_stats
            SET reputation = GREATEST(0, COALESCE(reputation, 0) - 15),
                answers_accepted = GREATEST(0, COALESCE(answers_accepted, 0) - 1),
                updated_at = NOW()
            WHERE user_id = v_old_author_id;

            INSERT INTO forum_reputation_log (user_id, change, reason, reference_id)
            VALUES (v_old_author_id, -15, 'accepted_answer_removed', v_old_answer_id);
        END IF;
    END IF;

    UPDATE forum_answers
    SET is_accepted = TRUE,
        updated_at = NOW()
    WHERE id = p_answer_id;

    UPDATE forum_questions
    SET accepted_answer_id = p_answer_id,
        updated_at = NOW()
    WHERE id = p_question_id;

    IF v_old_answer_id IS DISTINCT FROM p_answer_id THEN
        UPDATE profiles
        SET forum_reputation = COALESCE(forum_reputation, 0) + 15
        WHERE id = v_new_author_id;

        INSERT INTO forum_user_stats (user_id, reputation, answers_accepted, updated_at)
        VALUES (v_new_author_id, 15, 1, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET reputation = forum_user_stats.reputation + 15,
            answers_accepted = forum_user_stats.answers_accepted + 1,
            updated_at = NOW();

        INSERT INTO forum_reputation_log (user_id, change, reason, reference_id)
        VALUES (v_new_author_id, 15, 'answer_accepted', p_answer_id);
    END IF;
END;
$$;

-- Safe search RPC: returns matching question IDs without string-built PostgREST filters.
CREATE OR REPLACE FUNCTION search_forum_question_ids(
    p_query TEXT,
    p_limit INTEGER DEFAULT 200
)
RETURNS TABLE(id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_query TEXT := NULLIF(TRIM(p_query), '');
    v_tsquery TSQUERY;
BEGIN
    IF v_query IS NULL THEN
        RETURN;
    END IF;

    v_tsquery := websearch_to_tsquery('simple', v_query);

    RETURN QUERY
    SELECT fq.id
    FROM forum_questions fq
    WHERE fq.is_deleted = FALSE
      AND (
        to_tsvector('simple', COALESCE(fq.title, '') || ' ' || COALESCE(fq.body_plain, ''))
          @@ v_tsquery
        OR fq.title ILIKE '%' || v_query || '%'
        OR fq.body_plain ILIKE '%' || v_query || '%'
      )
    ORDER BY
      ts_rank(
        to_tsvector('simple', COALESCE(fq.title, '') || ' ' || COALESCE(fq.body_plain, '')),
        v_tsquery
      ) DESC,
      fq.upvotes DESC,
      fq.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
END;
$$;

-- ============================================================================
-- SECTION 8: GRANTS
-- ============================================================================

GRANT SELECT ON forum_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON forum_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON forum_answers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON forum_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON forum_votes TO authenticated;
GRANT SELECT, INSERT, DELETE ON forum_bookmarks TO authenticated;
GRANT SELECT ON forum_reputation_log TO authenticated;
GRANT SELECT ON forum_user_stats TO authenticated;
GRANT SELECT ON forum_tags TO authenticated;
GRANT EXECUTE ON FUNCTION increment_forum_question_view(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_forum_answer(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION vote_forum_content(TEXT, UUID, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_forum_answer(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION search_forum_question_ids(TEXT, INTEGER) TO anon, authenticated;

-- Service role gets full access for admin operations
GRANT ALL ON forum_categories TO service_role;
GRANT ALL ON forum_questions TO service_role;
GRANT ALL ON forum_answers TO service_role;
GRANT ALL ON forum_comments TO service_role;
GRANT ALL ON forum_votes TO service_role;
GRANT ALL ON forum_bookmarks TO service_role;
GRANT ALL ON forum_reputation_log TO service_role;
GRANT ALL ON forum_moderation_log TO service_role;
GRANT ALL ON forum_user_stats TO service_role;
GRANT ALL ON forum_tags TO service_role;

-- ============================================================================
-- END OF 08b_forum_tables.sql
-- ============================================================================
