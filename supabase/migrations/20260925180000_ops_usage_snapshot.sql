-- What the project is consuming, in one call.
--
-- Three numbers decide whether this project keeps working, and none of them is
-- reachable from an Edge Function on its own: the database size and the storage
-- totals live in schemas PostgREST does not expose, and a free-tier project
-- that quietly reaches its limit does not degrade -- it starts refusing writes,
-- which on this system means a student cannot submit a paper.
--
-- SECURITY DEFINER because storage.objects is not readable by the roles that
-- call this. It returns sizes only: no filenames, no owners, nothing about who
-- uploaded what.
CREATE OR REPLACE FUNCTION public.ops_usage_snapshot()
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public', 'storage', 'pg_catalog'
AS $function$
  SELECT jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'storage_bytes', (
      SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
      FROM storage.objects
    ),
    'buckets', (
      SELECT COALESCE(jsonb_agg(bucket ORDER BY bucket->>'name'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                 'name', b.name,
                 'objects', COUNT(o.id),
                 'bytes', COALESCE(SUM((o.metadata->>'size')::bigint), 0)
               ) AS bucket
        FROM storage.buckets b
        LEFT JOIN storage.objects o ON o.bucket_id = b.id
        GROUP BY b.name
      ) per_bucket
    )
  );
$function$;

-- Only the service role should read this. It is not secret, but it is not
-- something a student session has any reason to ask for either.
REVOKE ALL ON FUNCTION public.ops_usage_snapshot() FROM PUBLIC, anon, authenticated;
