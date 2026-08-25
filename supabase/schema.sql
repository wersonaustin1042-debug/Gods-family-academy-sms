-- Barima Dua Memorial School — Management System
-- Run this whole file once in Supabase: Project -> SQL Editor -> New query -> paste -> Run

-- ============ ACADEMIC STRUCTURE ============

create table academic_levels (
  id serial primary key,
  name text not null unique,       -- e.g. 'Creche', 'Primary 3', 'JHS 2'
  sort_order int not null unique   -- 1 = Creche ... 14 = JHS 3, used for promotion logic
);

insert into academic_levels (name, sort_order) values
  ('Creche',1),('Nursery 1',2),('Nursery 2',3),('KG 1',4),('KG 2',5),
  ('Primary 1',6),('Primary 2',7),('Primary 3',8),('Primary 4',9),
  ('Primary 5',10),('Primary 6',11),('JHS 1',12),('JHS 2',13),('JHS 3',14);

create table classrooms (
  id uuid primary key default gen_random_uuid(),
  level_id int references academic_levels(id) not null,
  section text not null default 'A',
  class_teacher_id uuid,  -- references profiles(id), added after profiles exists
  unique (level_id, section)
);

-- ============ PEOPLE ============
-- profiles extends Supabase's built-in auth.users (1-to-1)

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role text not null check (role in ('admin','teacher','parent')),
  created_at timestamptz default now()
);

alter table classrooms
  add constraint classrooms_teacher_fk foreign key (class_teacher_id) references profiles(id);

create table students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  date_of_birth date,
  classroom_id uuid references classrooms(id),
  admission_date date default current_date,
  status text not null default 'active' check (status in ('active','graduated','withdrawn')),
  created_at timestamptz default now()
);

-- many-to-many: a student can have up to 2 guardians, a parent can have multiple children
create table student_guardians (
  student_id uuid references students(id) on delete cascade,
  parent_id uuid references profiles(id) on delete cascade,
  primary key (student_id, parent_id)
);

-- ============ ATTENDANCE ============

create table attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) not null,
  classroom_id uuid references classrooms(id) not null,
  date date not null default current_date,
  status text not null check (status in ('present','absent','late')),
  recorded_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique (student_id, date)
);

-- ============ FEES ============

create table tuition_plans (
  student_id uuid primary key references students(id),
  total_amount numeric(10,2) not null default 1200,
  amount_paid numeric(10,2) not null default 0
);

create table tuition_payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) not null,
  amount numeric(10,2) not null,
  paid_on date default current_date,
  recorded_by uuid references profiles(id)
);

create table recurring_fees (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) not null,
  fee_type text not null check (fee_type in ('canteen','transport')),
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  amount numeric(10,2) not null,
  unique (student_id, fee_type)
);

create table recurring_fee_payments (
  id uuid primary key default gen_random_uuid(),
  recurring_fee_id uuid references recurring_fees(id) not null,
  period_key text not null,  -- e.g. '2026-07-21' (daily) / '2026-W29' (weekly) / '2026-07' (monthly)
  paid_on date default current_date,
  recorded_by uuid references profiles(id),
  unique (recurring_fee_id, period_key)
);

-- ============ ROW LEVEL SECURITY ============
-- Ensures parents only see their own children's data, teachers only their classes, etc.

alter table profiles enable row level security;
alter table students enable row level security;
alter table attendance enable row level security;
alter table tuition_plans enable row level security;
alter table tuition_payments enable row level security;
alter table recurring_fees enable row level security;
alter table recurring_fee_payments enable row level security;

create policy "profiles: view own" on profiles for select using (auth.uid() = id);

create policy "admin: full access students" on students for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

create policy "teacher: view students in own classroom" on students for select using (
  exists (
    select 1 from classrooms
    where classrooms.id = students.classroom_id
    and classrooms.class_teacher_id = auth.uid()
  )
);

create policy "parent: view own children" on students for select using (
  exists (
    select 1 from student_guardians
    where student_guardians.student_id = students.id
    and student_guardians.parent_id = auth.uid()
  )
);
