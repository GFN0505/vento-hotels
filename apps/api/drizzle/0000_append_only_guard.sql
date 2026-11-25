-- Append-only guard (decisions 0004 and 0008).
-- Folio postings, ledger entries and audit events are never edited or deleted: corrections are new
-- reversing rows with a reason. This trigger function enforces that in the database itself, so a
-- bug, a script or a hand-written query can't quietly change history. Attach it to a table with:
--   CREATE TRIGGER <table>_append_only BEFORE UPDATE OR DELETE ON <table>
--     FOR EACH ROW EXECUTE FUNCTION vento_forbid_update_delete();
CREATE OR REPLACE FUNCTION vento_forbid_update_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: this table is append-only. Write a reversing row instead.',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;
