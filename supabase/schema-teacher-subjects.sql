-- Requires schema-roles.sql (is_admin_like()) to already exist.
-- NOTE: already applied directly to the live GFA Supabase project via the
-- Supabase MCP connector; kept here as a record, matching the other files
-- in this folder.
--
-- Restricts which subjects a teacher can enter grades for, per classroom
-- they're assigned to — instead of any assigned-class teacher being able to
-- grade any subject in that class.
create table if not exists teacher_subjects (
  teacher_id uuid not null references profiles(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  subject_id integer not null references subjects(id) on delete cascade,
  primary key (teacher_id, classroom_id, subject_id)
);

alter table teacher_subjects enable row level security;
create policy "admin-like manage teacher_subjects" on teacher_subjects for all using (is_admin_like());
create policy "teachers view own subject assignments" on teacher_subjects for select using (auth.uid() = teacher_id);

-- Backfill: grandfather in every subject for every existing teacher-classroom
-- assignment, matching prior behavior, so nobody currently teaching loses
-- access the moment this ships. Admin narrows these down afterwards. Any
-- classroom assignment made after this migration starts with zero subjects
-- until the admin deliberately picks them.
insert into teacher_subjects (teacher_id, classroom_id, subject_id)
select tc.teacher_id, tc.classroom_id, s.id
from teacher_classrooms tc
join classrooms c on c.id = tc.classroom_id
join academic_levels al on al.id = c.level_id
join subjects s on s.category = (case when al.sort_order <= 5 then 'preschool' else 'primary_jhs' end)
on conflict do nothing;
