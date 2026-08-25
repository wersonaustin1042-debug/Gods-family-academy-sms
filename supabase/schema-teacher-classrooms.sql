-- Run in Supabase SQL Editor (new snippet)
-- Requires schema-roles.sql to have already run (needs is_admin_like())

create table teacher_classrooms (
  teacher_id uuid references profiles(id) on delete cascade,
  classroom_id uuid references classrooms(id) on delete cascade,
  primary key (teacher_id, classroom_id)
);

alter table teacher_classrooms enable row level security;

create policy "admin-like manage teacher_classrooms" on teacher_classrooms for all using (is_admin_like());
create policy "teacher view own assignments" on teacher_classrooms for select using (teacher_id = auth.uid());

-- Carry over any existing single homeroom assignments so nobody loses access
insert into teacher_classrooms (teacher_id, classroom_id)
select class_teacher_id, id from classrooms where class_teacher_id is not null
on conflict do nothing;

-- Update teacher-scoped policies to check teacher_classrooms instead of a single homeroom field
drop policy if exists "teacher: view students in own classroom" on students;
create policy "teacher: view students in assigned classrooms" on students for select using (
  exists (
    select 1 from teacher_classrooms
    where teacher_classrooms.classroom_id = students.classroom_id
    and teacher_classrooms.teacher_id = auth.uid()
  )
);

drop policy if exists "teacher manage own attendance" on attendance;
create policy "teacher manage assigned attendance" on attendance for all using (
  exists (
    select 1 from teacher_classrooms
    where teacher_classrooms.classroom_id = attendance.classroom_id
    and teacher_classrooms.teacher_id = auth.uid()
  )
);

drop policy if exists "teacher manage own exams" on exams;
create policy "teacher manage assigned exams" on exams for all using (
  exists (
    select 1 from teacher_classrooms
    where teacher_classrooms.classroom_id = exams.classroom_id
    and teacher_classrooms.teacher_id = auth.uid()
  )
);

drop policy if exists "teacher manage own results" on results;
create policy "teacher manage assigned results" on results for all using (
  exists (
    select 1 from exams
    join teacher_classrooms on teacher_classrooms.classroom_id = exams.classroom_id
    where exams.id = results.exam_id
    and teacher_classrooms.teacher_id = auth.uid()
  )
);
