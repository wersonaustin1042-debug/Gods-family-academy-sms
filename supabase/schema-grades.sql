-- Grades & Report Cards — run this in Supabase SQL Editor (new snippet)

create table exams (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid references classrooms(id) not null,
  subject_name text not null,
  term text not null check (term in ('Term 1','Term 2','Term 3')),
  exam_type text not null check (exam_type in ('Class Exercise/Assignment','Mid-term','End-of-term')),
  total_marks numeric(6,2) not null,
  created_at timestamptz default now(),
  unique (classroom_id, subject_name, term, exam_type)
);

create table results (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references exams(id) not null,
  student_id uuid references students(id) not null,
  score numeric(6,2) not null,
  grade text,
  recorded_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique (exam_id, student_id)
);

alter table exams enable row level security;
alter table results enable row level security;

create policy "admin manage exams" on exams for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "admin manage results" on results for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
