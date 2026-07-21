
-- 1. Remove public SELECT policy on feedback-files bucket
DROP POLICY IF EXISTS "Public read on feedback-files" ON storage.objects;

-- 2. Add admin-only SELECT/UPDATE/DELETE policies for feedback-files (reads still go through signed URLs)
CREATE POLICY "Admins read feedback-files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'feedback-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update feedback-files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'feedback-files' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'feedback-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete feedback-files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'feedback-files' AND public.has_role(auth.uid(), 'admin'));

-- 3. Revoke EXECUTE on internal SECURITY DEFINER trigger functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.enforce_baltazzar_domain() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_admin_for_baltazzar() FROM PUBLIC, anon, authenticated;

-- 4. Tighten public feedback INSERT policy: replace WITH CHECK (true) with basic non-empty validation
DROP POLICY IF EXISTS "Public can submit feedback" ON public.feedback;
CREATE POLICY "Public can submit feedback"
  ON public.feedback FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(btrim(client_code)) > 0
    AND length(btrim(name)) > 0
    AND length(btrim(email)) > 0
    AND length(btrim(subject)) > 0
    AND length(btrim(message)) > 0
  );
