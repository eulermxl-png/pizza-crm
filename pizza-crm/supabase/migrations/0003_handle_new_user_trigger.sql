-- Auto-create `public.users` row on new auth signup.
-- Default role is `cashier`; owner promotes via Supabase Dashboard / SQL as needed.

-- English: runs with definer rights so insert succeeds regardless of RLS on `public.users`.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, email, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      'Usuario'
    ),
    coalesce(
      nullif(trim(new.email), ''),
      new.id::text || '@users.local'
    ),
    'cashier'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();
