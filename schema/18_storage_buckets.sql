-- Storage buckets — run AFTER the main schema script.
-- student-photos: passport photos, upload restricted to admin-like roles.
-- Note: check your Supabase project for any other buckets in use
-- (e.g. a school logo bucket) and add them here too before reusing
-- this script for a new school.

insert into storage.buckets (id, name, public)
values ('student-photos', 'student-photos', true)
on conflict (id) do nothing;

create policy "Public read student photos"
on storage.objects for select
using (bucket_id = 'student-photos');

create policy "Admin-like upload student photos"
on storage.objects for insert
with check (bucket_id = 'student-photos' and is_admin_like());

create policy "Admin-like replace student photos"
on storage.objects for update
using (bucket_id = 'student-photos' and is_admin_like());

create policy "Admin-like delete student photos"
on storage.objects for delete
using (bucket_id = 'student-photos' and is_admin_like());
