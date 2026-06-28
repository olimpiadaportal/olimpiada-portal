-- 101_public_legal_document_rpc.sql
-- Purpose: expose only public legal document content to unauthenticated web/mobile clients.
-- Apply in Supabase SQL Editor.

BEGIN;

UPDATE system_settings
SET is_public = TRUE,
    updated_at = NOW()
WHERE key IN ('terms_of_service', 'privacy_policy', 'webapp_url');

CREATE OR REPLACE FUNCTION get_public_legal_document(p_type TEXT)
RETURNS TABLE(content TEXT, last_updated TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_type NOT IN ('terms_of_service', 'privacy_policy') THEN
    RAISE EXCEPTION 'Invalid legal document type';
  END IF;

  RETURN QUERY
  SELECT
    NULLIF(BTRIM(s.value #>> '{}'), '') AS content,
    s.updated_at AS last_updated
  FROM system_settings s
  WHERE s.key = p_type
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION get_public_legal_document(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_legal_document(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION get_public_legal_document(TEXT)
IS 'Returns only public legal document content for terms/privacy pages.';

COMMIT;
