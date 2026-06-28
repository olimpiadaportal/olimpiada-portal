-- ============================================================================
-- 92_forum_atomic_actions.sql
-- Purpose: Move forum counters, votes, answer creation, accept-answer, and
-- search into safer database RPCs.
-- Date: 2026-05-26
--
-- Rollback:
--   DROP FUNCTION IF EXISTS increment_forum_question_view(UUID);
--   DROP FUNCTION IF EXISTS create_forum_answer(UUID, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS vote_forum_content(TEXT, UUID, SMALLINT);
--   DROP FUNCTION IF EXISTS accept_forum_answer(UUID, UUID);
--   DROP FUNCTION IF EXISTS search_forum_question_ids(TEXT, INTEGER);
-- ============================================================================

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
        PERFORM 1 FROM forum_questions
        WHERE id = p_target_id AND is_deleted = FALSE
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Question not found';
        END IF;

        SELECT * INTO v_existing_vote
        FROM forum_votes
        WHERE user_id = v_user_id AND question_id = p_target_id
        FOR UPDATE;
    ELSIF p_target_type = 'answer' THEN
        PERFORM 1 FROM forum_answers
        WHERE id = p_target_id AND is_deleted = FALSE
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Answer not found';
        END IF;

        SELECT * INTO v_existing_vote
        FROM forum_votes
        WHERE user_id = v_user_id AND answer_id = p_target_id
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
            UPDATE forum_votes SET vote_type = p_vote_type WHERE id = v_existing_vote.id;
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

    SELECT accepted_answer_id INTO v_old_answer_id
    FROM forum_questions
    WHERE id = p_question_id
      AND is_deleted = FALSE
      AND (author_id = v_user_id OR is_forum_moderator(v_user_id))
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Question not found or not owned by caller';
    END IF;

    SELECT author_id INTO v_new_author_id
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
        SET is_accepted = FALSE, updated_at = NOW()
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
    SET is_accepted = TRUE, updated_at = NOW()
    WHERE id = p_answer_id;

    UPDATE forum_questions
    SET accepted_answer_id = p_answer_id, updated_at = NOW()
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
BEGIN
    IF v_query IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT fq.id
    FROM forum_questions fq
    WHERE fq.is_deleted = FALSE
      AND (
        to_tsvector('simple', COALESCE(fq.title, '') || ' ' || COALESCE(fq.body_plain, ''))
          @@ plainto_tsquery('simple', v_query)
        OR fq.title ILIKE '%' || v_query || '%'
        OR fq.body_plain ILIKE '%' || v_query || '%'
      )
    ORDER BY
      ts_rank(
        to_tsvector('simple', COALESCE(fq.title, '') || ' ' || COALESCE(fq.body_plain, '')),
        plainto_tsquery('simple', v_query)
      ) DESC,
      fq.upvotes DESC,
      fq.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
END;
$$;

GRANT EXECUTE ON FUNCTION increment_forum_question_view(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_forum_answer(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION vote_forum_content(TEXT, UUID, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_forum_answer(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION search_forum_question_ids(TEXT, INTEGER) TO anon, authenticated;
