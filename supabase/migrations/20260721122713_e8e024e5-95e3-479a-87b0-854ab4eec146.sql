
CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  type text NOT NULL DEFAULT 'feedback',
  subject text NOT NULL,
  category text NOT NULL,
  other_category text,
  message text NOT NULL,
  file_urls text[] NOT NULL DEFAULT '{}',
  tarefa_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.feedback TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can submit feedback"
  ON public.feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can read feedback"
  ON public.feedback FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public read on feedback-files"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'feedback-files');

CREATE POLICY "Public upload to feedback-files"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'feedback-files');
