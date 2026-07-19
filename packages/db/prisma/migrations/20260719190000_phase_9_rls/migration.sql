-- Phase 9: defense-in-depth tenant isolation.
--
-- Application code still scopes every query by role, but these policies make
-- Postgres reject cross-tenant rows even if an application-level WHERE clause is
-- accidentally widened. Request handlers set app.current_user_id through
-- packages/db.withRLS().

CREATE OR REPLACE FUNCTION app_current_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.current_user_id', true)
$$;

CREATE OR REPLACE FUNCTION app_can_view_document(document_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Document" d
    WHERE d."id" = document_id
      AND (
        d."ownerId" = app_current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "DocumentCollaborator" dc
          WHERE dc."documentId" = d."id"
            AND dc."userId" = app_current_user_id()
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION app_can_edit_document(document_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Document" d
    WHERE d."id" = document_id
      AND (
        d."ownerId" = app_current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "DocumentCollaborator" dc
          WHERE dc."documentId" = d."id"
            AND dc."userId" = app_current_user_id()
            AND dc."role" IN ('OWNER', 'EDITOR')
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION app_is_document_owner(document_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Document" d
    WHERE d."id" = document_id
      AND d."ownerId" = app_current_user_id()
  )
$$;

ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentCollaborator" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentVersion" ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_select_related ON "Document"
  FOR SELECT
  USING (app_can_view_document("id"));

CREATE POLICY document_insert_owner ON "Document"
  FOR INSERT
  WITH CHECK ("ownerId" = app_current_user_id());

CREATE POLICY document_update_editor ON "Document"
  FOR UPDATE
  USING (app_can_edit_document("id"))
  WITH CHECK (app_can_edit_document("id"));

CREATE POLICY document_delete_owner ON "Document"
  FOR DELETE
  USING ("ownerId" = app_current_user_id());

CREATE POLICY collaborator_select_related ON "DocumentCollaborator"
  FOR SELECT
  USING (app_can_view_document("documentId"));

CREATE POLICY collaborator_insert_owner ON "DocumentCollaborator"
  FOR INSERT
  WITH CHECK (app_is_document_owner("documentId"));

CREATE POLICY collaborator_update_owner ON "DocumentCollaborator"
  FOR UPDATE
  USING (app_is_document_owner("documentId"))
  WITH CHECK (app_is_document_owner("documentId"));

CREATE POLICY collaborator_delete_owner ON "DocumentCollaborator"
  FOR DELETE
  USING (app_is_document_owner("documentId"));

CREATE POLICY version_select_related ON "DocumentVersion"
  FOR SELECT
  USING (app_can_view_document("documentId"));

CREATE POLICY version_insert_editor ON "DocumentVersion"
  FOR INSERT
  WITH CHECK ("createdById" = app_current_user_id() AND app_can_edit_document("documentId"));

CREATE POLICY version_delete_owner ON "DocumentVersion"
  FOR DELETE
  USING ("isAutoSave" = true AND app_is_document_owner("documentId"));
