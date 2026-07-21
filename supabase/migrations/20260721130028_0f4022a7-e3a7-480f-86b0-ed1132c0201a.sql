
-- Block signup for non-baltazzar.com.br emails
CREATE OR REPLACE FUNCTION public.enforce_baltazzar_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL OR lower(split_part(NEW.email, '@', 2)) <> 'baltazzar.com.br' THEN
    RAISE EXCEPTION 'Acesso restrito a contas @baltazzar.com.br';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_baltazzar_domain_on_insert ON auth.users;
CREATE TRIGGER enforce_baltazzar_domain_on_insert
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_baltazzar_domain();

-- Auto-grant admin to verified baltazzar users
CREATE OR REPLACE FUNCTION public.grant_admin_for_baltazzar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(split_part(NEW.email, '@', 2)) = 'baltazzar.com.br' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grant_admin_baltazzar_on_insert ON auth.users;
CREATE TRIGGER grant_admin_baltazzar_on_insert
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_admin_for_baltazzar();

DROP TRIGGER IF EXISTS grant_admin_baltazzar_on_confirm ON auth.users;
CREATE TRIGGER grant_admin_baltazzar_on_confirm
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_admin_for_baltazzar();
