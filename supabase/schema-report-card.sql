-- Run in Supabase SQL Editor (new snippet)
-- Requires schema-roles.sql to have already run (needs is_admin_like())

-- School-wide term dates (vacation date, reopening date) — set once per term
create table term_info (
  id serial primary key,
  term text not null unique check (term in ('Term 1','Term 2','Term 3')),
  start_date date,
  end_date date,       -- vacation / closing date
  reopening_date date  -- next term begins
);
insert into term_info (term) values ('Term 1'), ('Term 2'), ('Term 3')
on conflict (term) do nothing;

alter table term_info enable row level security;
create policy "anyone can view term_info" on term_info for select using (true);
create policy "admin-like manage term_info" on term_info for all using (is_admin_like());

-- Per-student, per-term remarks and next-term billing
create table term_remarks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) not null,
  term text not null check (term in ('Term 1','Term 2','Term 3')),
  attitude text,
  teacher_remarks text,
  interests text,
  headteacher_remarks text,
  next_term_bill numeric(10,2),
  unique (student_id, term)
);

alter table term_remarks enable row level security;
create policy "admin-like manage term_remarks" on term_remarks for all using (is_admin_like());
create policy "teacher manage own class term_remarks" on term_remarks for all using (
  exists (
    select 1 from students
    join teacher_classrooms on teacher_classrooms.classroom_id = students.classroom_id
    where students.id = term_remarks.student_id
    and teacher_classrooms.teacher_id = auth.uid()
  )
);
create policy "parent view child term_remarks" on term_remarks for select using (
  exists (
    select 1 from student_guardians
    where student_guardians.student_id = term_remarks.student_id
    and student_guardians.parent_id = auth.uid()
  )
);
