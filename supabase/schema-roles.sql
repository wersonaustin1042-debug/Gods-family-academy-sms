-- Roles expansion: Director, Headmaster, Assistant Headmaster, Teacher, Accountant, Parent
-- Run this in Supabase SQL Editor (new snippet), once.

-- 1. Allow the new role values
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (
  role in ('admin','director','headmaster','assistant_headmaster','teacher','accountant','parent')
);

-- 2. Helper: is this user in a full-access ("admin-like") role?
create or replace function is_admin_like()
returns boolean language sql stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('admin','director','headmaster','assistant_headmaster')
  );
$$;

-- 3. Replace every "role = 'admin'" policy with the broader is_admin_like() check
drop policy if exists "admin: full access students" on students;
create policy "admin-like: full access students" on students for all using (is_admin_like());

drop policy if exists "admin manage classrooms" on classrooms;
create policy "admin-like manage classrooms" on classrooms for all using (is_admin_like());

drop policy if exists "admin manage tuition_plans" on tuition_plans;
create policy "admin-like manage tuition_plans" on tuition_plans for all using (is_admin_like());

drop policy if exists "admin manage tuition_payments" on tuition_payments;
create policy "admin-like manage tuition_payments" on tuition_payments for all using (is_admin_like());

drop policy if exists "admin manage recurring_fees" on recurring_fees;
create policy "admin-like manage recurring_fees" on recurring_fees for all using (is_admin_like());

drop policy if exists "admin manage recurring_fee_payments" on recurring_fee_payments;
create policy "admin-like manage recurring_fee_payments" on recurring_fee_payments for all using (is_admin_like());

drop policy if exists "admin manage attendance" on attendance;
create policy "admin-like manage attendance" on attendance for all using (is_admin_like());

drop policy if exists "admin manage exams" on exams;
create policy "admin-like manage exams" on exams for all using (is_admin_like());

drop policy if exists "admin manage results" on results;
create policy "admin-like manage results" on results for all using (is_admin_like());

drop policy if exists "admin manage subjects" on subjects;
create policy "admin-like manage subjects" on subjects for all using (is_admin_like());

-- 4. Accountant: full access to fee tables, read-only on students/classrooms
create policy "accountant manage tuition_plans" on tuition_plans for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'accountant')
);
create policy "accountant manage tuition_payments" on tuition_payments for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'accountant')
);
create policy "accountant manage recurring_fees" on recurring_fees for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'accountant')
);
create policy "accountant manage recurring_fee_payments" on recurring_fee_payments for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'accountant')
);
create policy "accountant view students" on students for select using (
  exists (select 1 from profiles where id = auth.uid() and role = 'accountant')
);

-- 5. Teacher: manage exams/results for their own classroom (attendance policy already exists)
create policy "teacher manage own exams" on exams for all using (
  exists (
    select 1 from classrooms
    where classrooms.id = exams.classroom_id
    and classrooms.class_teacher_id = auth.uid()
  )
);
create policy "teacher manage own results" on results for all using (
  exists (
    select 1 from exams
    join classrooms on classrooms.id = exams.classroom_id
    where exams.id = results.exam_id
    and classrooms.class_teacher_id = auth.uid()
  )
);

-- 6. Parent: read-only visibility into their own child's records
create policy "parent view child attendance" on attendance for select using (
  exists (
    select 1 from student_guardians
    where student_guardians.student_id = attendance.student_id
    and student_guardians.parent_id = auth.uid()
  )
);
create policy "parent view exams for child" on exams for select using (
  exists (
    select 1 from students
    join student_guardians on student_guardians.student_id = students.id
    where students.classroom_id = exams.classroom_id
    and student_guardians.parent_id = auth.uid()
  )
);
create policy "parent view child results" on results for select using (
  exists (
    select 1 from student_guardians
    where student_guardians.student_id = results.student_id
    and student_guardians.parent_id = auth.uid()
  )
);
create policy "parent view child tuition_plans" on tuition_plans for select using (
  exists (
    select 1 from student_guardians
    where student_guardians.student_id = tuition_plans.student_id
    and student_guardians.parent_id = auth.uid()
  )
);
create policy "parent view child recurring_fees" on recurring_fees for select using (
  exists (
    select 1 from student_guardians
    where student_guardians.student_id = recurring_fees.student_id
    and student_guardians.parent_id = auth.uid()
  )
);
create policy "parent view child recurring_fee_payments" on recurring_fee_payments for select using (
  exists (
    select 1 from recurring_fees
    join student_guardians on student_guardians.student_id = recurring_fees.student_id
    where recurring_fees.id = recurring_fee_payments.recurring_fee_id
    and student_guardians.parent_id = auth.uid()
  )
);
