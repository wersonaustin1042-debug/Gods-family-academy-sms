-- ============================================================
-- School SMS — full database setup script
-- Generated from the live God's Family Academy project,
-- for reuse as the starting point on every future school.
--
-- Run this ONCE in a brand-new Supabase project's SQL Editor,
-- top to bottom, on an empty database.
--
-- Order matters: functions first (policies depend on them),
-- then tables (in FK dependency order), then RLS policies last.
-- After this, also run the storage bucket setup separately
-- (see 18_storage_buckets.sql) and seed academic_levels/subjects
-- with your data if the new school's structure differs.
-- ============================================================

-- Helper functions used by RLS policies throughout the schema.
-- Must be created BEFORE the policies that reference them.

create or replace function is_admin_like()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('admin','director','headmaster','assistant_headmaster')
  );
$$;

create or replace function is_director_like()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin','director')
  );
$$;

create table public.academic_levels (
  id serial not null,
  name text not null,
  sort_order integer not null,
  constraint academic_levels_pkey primary key (id),
  constraint academic_levels_name_key unique (name),
  constraint academic_levels_sort_order_key unique (sort_order)
) TABLESPACE pg_default;

create table public.profiles (
  id uuid not null,
  full_name text not null,
  phone text null,
  role text not null,
  created_at timestamp with time zone null default now(),
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE,
  constraint profiles_role_check check (
    (
      role = any (
        array[
          'admin'::text,
          'director'::text,
          'headmaster'::text,
          'assistant_headmaster'::text,
          'teacher'::text,
          'accountant'::text,
          'parent'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create table public.classrooms (
  id uuid not null default gen_random_uuid (),
  level_id integer not null,
  section text not null default 'A'::text,
  class_teacher_id uuid null,
  constraint classrooms_pkey primary key (id),
  constraint classrooms_level_id_section_key unique (level_id, section),
  constraint classrooms_level_id_fkey foreign KEY (level_id) references academic_levels (id),
  constraint classrooms_teacher_fk foreign KEY (class_teacher_id) references profiles (id)
) TABLESPACE pg_default;

create table public.students (
  id uuid not null default gen_random_uuid (),
  full_name text not null,
  date_of_birth date null,
  classroom_id uuid null,
  admission_date date null default CURRENT_DATE,
  status text not null default 'active'::text,
  created_at timestamp with time zone null default now(),
  guardian_name text null,
  guardian_phone text null,
  guardian_relationship text null,
  remarks text null,
  photo_url text null,
  constraint students_pkey primary key (id),
  constraint students_classroom_id_fkey foreign KEY (classroom_id) references classrooms (id),
  constraint students_status_check check (
    (
      status = any (
        array[
          'active'::text,
          'graduated'::text,
          'withdrawn'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create table public.attendance (
  id uuid not null default gen_random_uuid (),
  student_id uuid not null,
  classroom_id uuid not null,
  date date not null default CURRENT_DATE,
  status text not null,
  recorded_by uuid null,
  created_at timestamp with time zone null default now(),
  constraint attendance_pkey primary key (id),
  constraint attendance_student_id_date_key unique (student_id, date),
  constraint attendance_classroom_id_fkey foreign KEY (classroom_id) references classrooms (id),
  constraint attendance_recorded_by_fkey foreign KEY (recorded_by) references profiles (id),
  constraint attendance_student_id_fkey foreign KEY (student_id) references students (id),
  constraint attendance_status_check check (
    (
      status = any (
        array['present'::text, 'absent'::text, 'late'::text]
      )
    )
  )
) TABLESPACE pg_default;

create table public.exams (
  id uuid not null default gen_random_uuid (),
  classroom_id uuid not null,
  subject_name text not null,
  term text not null,
  exam_type text not null,
  total_marks numeric(6, 2) not null,
  created_at timestamp with time zone null default now(),
  constraint exams_pkey primary key (id),
  constraint exams_classroom_id_subject_name_term_exam_type_key unique (classroom_id, subject_name, term, exam_type),
  constraint exams_classroom_id_fkey foreign KEY (classroom_id) references classrooms (id),
  constraint exams_exam_type_check check (
    (
      exam_type = any (
        array[
          'Class Exercise/Assignment'::text,
          'Mid-term'::text,
          'End-of-term'::text
        ]
      )
    )
  ),
  constraint exams_term_check check (
    (
      term = any (
        array['Term 1'::text, 'Term 2'::text, 'Term 3'::text]
      )
    )
  )
) TABLESPACE pg_default;

create table public.recurring_fees (
  id uuid not null default gen_random_uuid (),
  student_id uuid not null,
  fee_type text not null,
  frequency text not null,
  amount numeric(10, 2) not null,
  constraint recurring_fees_pkey primary key (id),
  constraint recurring_fees_student_id_fee_type_key unique (student_id, fee_type),
  constraint recurring_fees_student_id_fkey foreign KEY (student_id) references students (id),
  constraint recurring_fees_fee_type_check check (
    (
      fee_type = any (array['canteen'::text, 'transport'::text])
    )
  ),
  constraint recurring_fees_frequency_check check (
    (
      frequency = any (
        array['daily'::text, 'weekly'::text, 'monthly'::text]
      )
    )
  )
) TABLESPACE pg_default;

create table public.recurring_fee_payments (
  id uuid not null default gen_random_uuid (),
  recurring_fee_id uuid not null,
  period_key text not null,
  paid_on date null default CURRENT_DATE,
  recorded_by uuid null,
  constraint recurring_fee_payments_pkey primary key (id),
  constraint recurring_fee_payments_recurring_fee_id_period_key_key unique (recurring_fee_id, period_key),
  constraint recurring_fee_payments_recorded_by_fkey foreign KEY (recorded_by) references profiles (id),
  constraint recurring_fee_payments_recurring_fee_id_fkey foreign KEY (recurring_fee_id) references recurring_fees (id)
) TABLESPACE pg_default;

create table public.results (
  id uuid not null default gen_random_uuid (),
  exam_id uuid not null,
  student_id uuid not null,
  score numeric(6, 2) not null,
  grade text null,
  recorded_by uuid null,
  created_at timestamp with time zone null default now(),
  constraint results_pkey primary key (id),
  constraint results_exam_id_student_id_key unique (exam_id, student_id),
  constraint results_exam_id_fkey foreign KEY (exam_id) references exams (id),
  constraint results_recorded_by_fkey foreign KEY (recorded_by) references profiles (id),
  constraint results_student_id_fkey foreign KEY (student_id) references students (id)
) TABLESPACE pg_default;

create table public.student_guardians (
  student_id uuid not null,
  parent_id uuid not null,
  constraint student_guardians_pkey primary key (student_id, parent_id),
  constraint student_guardians_parent_id_fkey foreign KEY (parent_id) references profiles (id) on delete CASCADE,
  constraint student_guardians_student_id_fkey foreign KEY (student_id) references students (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.subjects (
  id serial not null,
  name text not null,
  category text null default 'primary_jhs'::text,
  constraint subjects_pkey primary key (id),
  constraint subjects_name_key unique (name),
  constraint subjects_category_check check (
    (
      category = any (array['preschool'::text, 'primary_jhs'::text])
    )
  )
) TABLESPACE pg_default;

create table public.teacher_classrooms (
  teacher_id uuid not null,
  classroom_id uuid not null,
  constraint teacher_classrooms_pkey primary key (teacher_id, classroom_id),
  constraint teacher_classrooms_classroom_id_fkey foreign KEY (classroom_id) references classrooms (id) on delete CASCADE,
  constraint teacher_classrooms_teacher_id_fkey foreign KEY (teacher_id) references profiles (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.term_info (
  id serial not null,
  term text not null,
  start_date date null,
  end_date date null,
  reopening_date date null,
  constraint term_info_pkey primary key (id),
  constraint term_info_term_key unique (term),
  constraint term_info_term_check check (
    (
      term = any (
        array['Term 1'::text, 'Term 2'::text, 'Term 3'::text]
      )
    )
  )
) TABLESPACE pg_default;

create table public.term_remarks (
  id uuid not null default gen_random_uuid (),
  student_id uuid not null,
  term text not null,
  attitude text null,
  teacher_remarks text null,
  interests text null,
  headteacher_remarks text null,
  next_term_bill numeric(10, 2) null,
  constraint term_remarks_pkey primary key (id),
  constraint term_remarks_student_id_term_key unique (student_id, term),
  constraint term_remarks_student_id_fkey foreign KEY (student_id) references students (id),
  constraint term_remarks_term_check check (
    (
      term = any (
        array['Term 1'::text, 'Term 2'::text, 'Term 3'::text]
      )
    )
  )
) TABLESPACE pg_default;

create table public.tuition_payments (
  id uuid not null default gen_random_uuid (),
  student_id uuid not null,
  amount numeric(10, 2) not null,
  paid_on date null default CURRENT_DATE,
  recorded_by uuid null,
  constraint tuition_payments_pkey primary key (id),
  constraint tuition_payments_student_date_unique unique (student_id, paid_on),
  constraint tuition_payments_recorded_by_fkey foreign KEY (recorded_by) references profiles (id),
  constraint tuition_payments_student_id_fkey foreign KEY (student_id) references students (id)
) TABLESPACE pg_default;

create table public.tuition_plans (
  student_id uuid not null,
  total_amount numeric(10, 2) not null default 1200,
  amount_paid numeric(10, 2) not null default 0,
  constraint tuition_plans_pkey primary key (student_id),
  constraint tuition_plans_student_id_fkey foreign KEY (student_id) references students (id)
) TABLESPACE pg_default;

-- RLS policies for all tables, generated from live pg_policies export

-- ===== academic_levels =====
alter table public.academic_levels enable row level security;

create policy "anyone can view levels"
on public.academic_levels
for SELECT
to public
using (
  true
);


-- ===== attendance =====
alter table public.attendance enable row level security;

create policy "admin-like manage attendance"
on public.attendance
for ALL
to public
using (
  is_admin_like()
);

create policy "parent view child attendance"
on public.attendance
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM student_guardians
  WHERE ((student_guardians.student_id = attendance.student_id) AND (student_guardians.parent_id = auth.uid()))))
);

create policy "teacher manage assigned attendance"
on public.attendance
for ALL
to public
using (
  (EXISTS ( SELECT 1
   FROM teacher_classrooms
  WHERE ((teacher_classrooms.classroom_id = attendance.classroom_id) AND (teacher_classrooms.teacher_id = auth.uid()))))
);


-- ===== classrooms =====
alter table public.classrooms enable row level security;

create policy "admin-like manage classrooms"
on public.classrooms
for ALL
to public
using (
  is_admin_like()
);

create policy "anyone can view classrooms"
on public.classrooms
for SELECT
to public
using (
  true
);


-- ===== exams =====
alter table public.exams enable row level security;

create policy "admin-like manage exams"
on public.exams
for ALL
to public
using (
  is_admin_like()
);

create policy "parent view exams for child"
on public.exams
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM (students
     JOIN student_guardians ON ((student_guardians.student_id = students.id)))
  WHERE ((students.classroom_id = exams.classroom_id) AND (student_guardians.parent_id = auth.uid()))))
);

create policy "teacher manage assigned exams"
on public.exams
for ALL
to public
using (
  (EXISTS ( SELECT 1
   FROM teacher_classrooms
  WHERE ((teacher_classrooms.classroom_id = exams.classroom_id) AND (teacher_classrooms.teacher_id = auth.uid()))))
);


-- ===== profiles =====
alter table public.profiles enable row level security;

create policy "admin-like manage profiles"
on public.profiles
for ALL
to public
using (
  is_admin_like()
);

create policy "profiles: view own"
on public.profiles
for SELECT
to public
using (
  (auth.uid() = id)
);

create policy "users read own profile"
on public.profiles
for SELECT
to authenticated
using (
  (id = auth.uid())
);


-- ===== recurring_fee_payments =====
alter table public.recurring_fee_payments enable row level security;

create policy "accountant insert recurring_fee_payments"
on public.recurring_fee_payments
for INSERT
to public
with check (
  (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'accountant'::text))))
);

create policy "accountant select recurring_fee_payments"
on public.recurring_fee_payments
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'accountant'::text))))
);

create policy "director full control recurring_fee_payments"
on public.recurring_fee_payments
for ALL
to public
using (
  is_director_like()
);

create policy "headmaster view recurring_fee_payments"
on public.recurring_fee_payments
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['headmaster'::text, 'assistant_headmaster'::text])))))
);

create policy "parent view child recurring_fee_payments"
on public.recurring_fee_payments
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM (recurring_fees
     JOIN student_guardians ON ((student_guardians.student_id = recurring_fees.student_id)))
  WHERE ((recurring_fees.id = recurring_fee_payments.recurring_fee_id) AND (student_guardians.parent_id = auth.uid()))))
);

create policy "teacher manage own homeroom recurring_fee_payments"
on public.recurring_fee_payments
for ALL
to authenticated
using (
  (EXISTS ( SELECT 1
   FROM ((recurring_fees
     JOIN students ON ((students.id = recurring_fees.student_id)))
     JOIN classrooms ON ((classrooms.id = students.classroom_id)))
  WHERE ((recurring_fees.id = recurring_fee_payments.recurring_fee_id) AND (classrooms.class_teacher_id = auth.uid()))))
)
with check (
  (EXISTS ( SELECT 1
   FROM ((recurring_fees
     JOIN students ON ((students.id = recurring_fees.student_id)))
     JOIN classrooms ON ((classrooms.id = students.classroom_id)))
  WHERE ((recurring_fees.id = recurring_fee_payments.recurring_fee_id) AND (classrooms.class_teacher_id = auth.uid()))))
);


-- ===== recurring_fees =====
alter table public.recurring_fees enable row level security;

create policy "accountant manage recurring_fees"
on public.recurring_fees
for ALL
to public
using (
  (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'accountant'::text))))
);

create policy "director full control recurring_fees"
on public.recurring_fees
for ALL
to public
using (
  is_director_like()
);

create policy "headmaster view recurring_fees"
on public.recurring_fees
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['headmaster'::text, 'assistant_headmaster'::text])))))
);

create policy "parent view child recurring_fees"
on public.recurring_fees
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM student_guardians
  WHERE ((student_guardians.student_id = recurring_fees.student_id) AND (student_guardians.parent_id = auth.uid()))))
);

create policy "teacher manage own homeroom recurring_fees"
on public.recurring_fees
for ALL
to authenticated
using (
  (EXISTS ( SELECT 1
   FROM (students
     JOIN classrooms ON ((classrooms.id = students.classroom_id)))
  WHERE ((students.id = recurring_fees.student_id) AND (classrooms.class_teacher_id = auth.uid()))))
)
with check (
  (EXISTS ( SELECT 1
   FROM (students
     JOIN classrooms ON ((classrooms.id = students.classroom_id)))
  WHERE ((students.id = recurring_fees.student_id) AND (classrooms.class_teacher_id = auth.uid()))))
);


-- ===== results =====
alter table public.results enable row level security;

create policy "admin-like manage results"
on public.results
for ALL
to public
using (
  is_admin_like()
);

create policy "parent view child results"
on public.results
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM student_guardians
  WHERE ((student_guardians.student_id = results.student_id) AND (student_guardians.parent_id = auth.uid()))))
);

create policy "teacher manage assigned results"
on public.results
for ALL
to public
using (
  (EXISTS ( SELECT 1
   FROM (exams
     JOIN teacher_classrooms ON ((teacher_classrooms.classroom_id = exams.classroom_id)))
  WHERE ((exams.id = results.exam_id) AND (teacher_classrooms.teacher_id = auth.uid()))))
);


-- ===== student_guardians =====
alter table public.student_guardians enable row level security;

create policy "admin-like manage student_guardians"
on public.student_guardians
for ALL
to authenticated
using (
  is_admin_like()
)
with check (
  is_admin_like()
);

create policy "parent view own links"
on public.student_guardians
for SELECT
to authenticated
using (
  (parent_id = auth.uid())
);


-- ===== students =====
alter table public.students enable row level security;

create policy "accountant view students"
on public.students
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'accountant'::text))))
);

create policy "admin-like: full access students"
on public.students
for ALL
to public
using (
  is_admin_like()
);

create policy "parent: view own children"
on public.students
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM student_guardians
  WHERE ((student_guardians.student_id = students.id) AND (student_guardians.parent_id = auth.uid()))))
);

create policy "teacher: view students in assigned classrooms"
on public.students
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM teacher_classrooms
  WHERE ((teacher_classrooms.classroom_id = students.classroom_id) AND (teacher_classrooms.teacher_id = auth.uid()))))
);


-- ===== subjects =====
alter table public.subjects enable row level security;

create policy "admin-like manage subjects"
on public.subjects
for ALL
to public
using (
  is_admin_like()
);

create policy "anyone can view subjects"
on public.subjects
for SELECT
to public
using (
  true
);


-- ===== teacher_classrooms =====
alter table public.teacher_classrooms enable row level security;

create policy "admin-like manage teacher_classrooms"
on public.teacher_classrooms
for ALL
to public
using (
  is_admin_like()
);

create policy "teacher view own assignments"
on public.teacher_classrooms
for SELECT
to public
using (
  (teacher_id = auth.uid())
);


-- ===== term_info =====
alter table public.term_info enable row level security;

create policy "admin-like manage term_info"
on public.term_info
for ALL
to public
using (
  is_admin_like()
);

create policy "anyone can view term_info"
on public.term_info
for SELECT
to public
using (
  true
);


-- ===== term_remarks =====
alter table public.term_remarks enable row level security;

create policy "admin-like manage term_remarks"
on public.term_remarks
for ALL
to public
using (
  is_admin_like()
);

create policy "parent view child term_remarks"
on public.term_remarks
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM student_guardians
  WHERE ((student_guardians.student_id = term_remarks.student_id) AND (student_guardians.parent_id = auth.uid()))))
);

create policy "teacher manage own class term_remarks"
on public.term_remarks
for ALL
to public
using (
  (EXISTS ( SELECT 1
   FROM (students
     JOIN teacher_classrooms ON ((teacher_classrooms.classroom_id = students.classroom_id)))
  WHERE ((students.id = term_remarks.student_id) AND (teacher_classrooms.teacher_id = auth.uid()))))
);


-- ===== tuition_payments =====
alter table public.tuition_payments enable row level security;

create policy "accountant insert tuition_payments"
on public.tuition_payments
for INSERT
to public
with check (
  (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'accountant'::text))))
);

create policy "accountant select tuition_payments"
on public.tuition_payments
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'accountant'::text))))
);

create policy "director full control tuition_payments"
on public.tuition_payments
for ALL
to public
using (
  is_director_like()
);

create policy "headmaster view tuition_payments"
on public.tuition_payments
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['headmaster'::text, 'assistant_headmaster'::text])))))
);

create policy "teacher manage own homeroom tuition_payments"
on public.tuition_payments
for ALL
to authenticated
using (
  (EXISTS ( SELECT 1
   FROM (students
     JOIN classrooms ON ((classrooms.id = students.classroom_id)))
  WHERE ((students.id = tuition_payments.student_id) AND (classrooms.class_teacher_id = auth.uid()))))
)
with check (
  (EXISTS ( SELECT 1
   FROM (students
     JOIN classrooms ON ((classrooms.id = students.classroom_id)))
  WHERE ((students.id = tuition_payments.student_id) AND (classrooms.class_teacher_id = auth.uid()))))
);


-- ===== tuition_plans =====
alter table public.tuition_plans enable row level security;

create policy "accountant manage tuition_plans"
on public.tuition_plans
for ALL
to public
using (
  (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'accountant'::text))))
);

create policy "director full control tuition_plans"
on public.tuition_plans
for ALL
to public
using (
  is_director_like()
);

create policy "headmaster view tuition_plans"
on public.tuition_plans
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['headmaster'::text, 'assistant_headmaster'::text])))))
);

create policy "parent view child tuition_plans"
on public.tuition_plans
for SELECT
to public
using (
  (EXISTS ( SELECT 1
   FROM student_guardians
  WHERE ((student_guardians.student_id = tuition_plans.student_id) AND (student_guardians.parent_id = auth.uid()))))
);

create policy "teacher manage own homeroom tuition_plans"
on public.tuition_plans
for ALL
to authenticated
using (
  (EXISTS ( SELECT 1
   FROM (students
     JOIN classrooms ON ((classrooms.id = students.classroom_id)))
  WHERE ((students.id = tuition_plans.student_id) AND (classrooms.class_teacher_id = auth.uid()))))
)
with check (
  (EXISTS ( SELECT 1
   FROM (students
     JOIN classrooms ON ((classrooms.id = students.classroom_id)))
  WHERE ((students.id = tuition_plans.student_id) AND (classrooms.class_teacher_id = auth.uid()))))
);

