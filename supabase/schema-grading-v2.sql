-- GFA grading v2: SBA (4 x 15) + Exam (100), BECE / GCE-style grade scales,
-- university-style class bands, and a pick-list of report card comments.
-- Additive only: legacy exam types stay allowed so old test rows are untouched.

-- 1. New mark components -------------------------------------------------
alter table exams drop constraint if exists exams_exam_type_check;
alter table exams add constraint exams_exam_type_check check (
  exam_type in (
    'Class Exercise/Assignment', 'Mid-term', 'End-of-term',  -- legacy
    'SBA 1', 'SBA 2', 'SBA 3', 'SBA 4', 'Exam'
  )
);

alter table results add column if not exists did_not_write boolean not null default false;

-- 2. Grade scales ---------------------------------------------------------
-- scale 'primary' = pre-school + primary (A-U, grades 1-8)
-- scale 'jhs'     = JHS (BECE, A+ - F, grades 1-9)
-- A mark gets the first row (highest min_mark first) whose min_mark it reaches.
create table if not exists grade_scales (
  id serial primary key,
  scale text not null check (scale in ('primary', 'jhs')),
  min_mark numeric not null,
  grade text not null,
  grade_value int not null,
  remark text not null,
  unique (scale, min_mark)
);

insert into grade_scales (scale, min_mark, grade, grade_value, remark) values
  ('primary', 80, 'A', 1, 'Highest'),
  ('primary', 70, 'B', 2, 'Higher'),
  ('primary', 60, 'C', 3, 'High'),
  ('primary', 50, 'D', 4, 'High average'),
  ('primary', 40, 'E', 5, 'Average'),
  ('primary', 30, 'F', 6, 'Low average'),
  ('primary', 20, 'G', 7, 'Low'),
  ('primary', 0,  'U', 8, 'Lower'),
  ('jhs', 90, 'A+', 1, 'Highest'),
  ('jhs', 80, 'A',  2, 'Higher'),
  ('jhs', 70, 'B+', 3, 'High'),
  ('jhs', 60, 'B',  4, 'High average'),
  ('jhs', 55, 'C+', 5, 'Average'),
  ('jhs', 50, 'C',  6, 'Low average'),
  ('jhs', 40, 'D+', 7, 'Low'),
  ('jhs', 35, 'E',  8, 'Lower'),
  ('jhs', 0,  'F',  9, 'Lowest')
on conflict (scale, min_mark) do nothing;

-- 3. Class bands (average mark across all subjects) ------------------------
create table if not exists class_bands (
  id serial primary key,
  label text not null unique,
  min_average numeric not null unique
);

insert into class_bands (label, min_average) values
  ('1st Class', 85),
  ('2nd Class Upper', 70),
  ('2nd Class Lower', 60),
  ('3rd Class', 50),
  ('Pass', 0)
on conflict do nothing;

-- 4. Comments library ------------------------------------------------------
create table if not exists report_comments (
  id serial primary key,
  category text not null,
  comment text not null,
  tag text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into report_comments (category, comment, tag, sort_order) values
  ('Academic Performance & Excellence', 'Consistently produces insightful, well-structured work across subject areas.', 'High Academic Achievement', 1),
  ('Academic Performance & Excellence', 'Demonstrates strong problem-solving skills and remarkable perseverance when tackling complex tasks.', 'Critical Thinking', 2),
  ('Academic Performance & Excellence', 'An enthusiastic learner who approaches all subjects with a positive attitude and genuine interest.', 'Learning Attitude', 3),
  ('Academic Performance & Excellence', 'Has an impressive vocabulary and vivid language skills that significantly improve written expression.', 'Communication', 4),
  ('Academic Performance & Excellence', 'Strives to reach full potential and consistently sets high personal standards for academic excellence.', 'Motivation', 5),
  ('Classroom Engagement & Participation', 'A curious and active participant who enriches classroom discussions with thoughtful questions.', 'Active Inquiry', 6),
  ('Classroom Engagement & Participation', 'Shares valuable knowledge and insights that greatly contribute to whole-class learning.', 'Class Contribution', 7),
  ('Classroom Engagement & Participation', 'Eager to engage in daily learning activities and approaches new concepts with enthusiasm.', 'Enthusiasm', 8),
  ('Classroom Engagement & Participation', 'Expresses ideas clearly and purposefully during both small group and class activities.', 'Self-Expression', 9),
  ('Classroom Engagement & Participation', 'Listens attentively to others'' ideas, showing exceptional respect and intellectual curiosity.', 'Active Listening', 10),
  ('Conduct, Character & Citizenship', 'Consistently demonstrates excellent behavior, maturity, and respect for classroom rules.', 'Exemplary Conduct', 11),
  ('Conduct, Character & Citizenship', 'Sets a positive example for peers through responsible choices and thoughtful actions.', 'Role Model', 12),
  ('Conduct, Character & Citizenship', 'Displays high discipline, managing emotions and challenges with impressive maturity.', 'Self-Regulation', 13),
  ('Conduct, Character & Citizenship', 'A polite, courteous, and dependable student who exemplifies good stewardship toward others.', 'Character & Manners', 14),
  ('Conduct, Character & Citizenship', 'Demonstrates genuine empathy and kindness, creating a welcoming atmosphere for classmates.', 'Empathy', 15),
  ('Collaboration & Leadership', 'A natural leader who collaborates democratically and encourages group members to perform their best.', 'Group Leadership', 16),
  ('Collaboration & Leadership', 'Takes on active roles in group settings, ensuring team tasks are executed fairly and efficiently.', 'Teamwork', 17),
  ('Collaboration & Leadership', 'A collaborative learner who shows great initiative and keeps project teams focused on task.', 'Task Leadership', 18),
  ('Collaboration & Leadership', 'Receptive to group feedback and works harmoniously with peers to achieve shared goals.', 'Cooperation', 19),
  ('Collaboration & Leadership', 'Well-liked and respected by classmates for willingness to help and support others.', 'Peer Support', 20),
  ('Work Habits, Diligence & Effort', 'A responsible, hardworking student who consistently gives best effort on every assignment.', 'Consistent Effort', 21),
  ('Work Habits, Diligence & Effort', 'Stays focused when working independently and makes remarkably efficient use of class time.', 'Time Management', 22),
  ('Work Habits, Diligence & Effort', 'Pays close attention to detail and double-checks work to ensure high quality and accuracy.', 'Quality & Precision', 23),
  ('Work Habits, Diligence & Effort', 'Demonstrates exceptional self-motivation and completes assignments promptly with care.', 'Self-Motivation', 24),
  ('Work Habits, Diligence & Effort', 'Shows admirable persistence when working through challenging topics and tasks.', 'Perseverance', 25),
  ('Talent, Creativity & Special Interests', 'Displays a bright imagination and outstanding creative flair in written and practical projects.', 'Creativity', 26),
  ('Talent, Creativity & Special Interests', 'Independently seeks out additional information on classroom topics of interest.', 'Self-Directed Inquiry', 27),
  ('Talent, Creativity & Special Interests', 'Has a wide range of interests and confidently shares background knowledge with the class.', 'Broad Knowledge', 28),
  ('Talent, Creativity & Special Interests', 'A gifted and expressive performer who brings passion and enthusiasm to learning tasks.', 'Performance Talent', 29),
  ('Talent, Creativity & Special Interests', 'A joy to teach, bringing a wonderfully optimistic attitude and creative energy to class.', 'Positive Spirit', 30),
  ('Constructive & Growth-Oriented (Next Steps)', 'Demonstrates good potential; focusing on daily revision will help translate efforts into higher test performance.', 'Revision Habit', 31),
  ('Constructive & Growth-Oriented (Next Steps)', 'Shows great enthusiasm in class; paying closer attention to instructions will prevent minor errors on assessments.', 'Attention to Detail', 32),
  ('Constructive & Growth-Oriented (Next Steps)', 'Has solid foundational understanding; practicing time management during exams will yield even better results.', 'Exam Technique', 33),
  ('Constructive & Growth-Oriented (Next Steps)', 'Encouraged to actively participate in group discussions to further build confidence and share insightful ideas.', 'Confidence', 34),
  ('Constructive & Growth-Oriented (Next Steps)', 'Would benefit from establishing a structured home study routine to consolidate key concepts covered in class.', 'Study Habits', 35),
  ('Digital Assessment & Online Learning', 'Adapts remarkably well to digital exam formats and demonstrates sharp computer literacy.', 'Digital Literacy', 36),
  ('Digital Assessment & Online Learning', 'Utilizes online learning resources efficiently to deepen understanding of complex topics.', 'Digital Resource Use', 37),
  ('Digital Assessment & Online Learning', 'Displays excellent focus and independence when taking online assessments.', 'Digital Focus', 38),
  ('Digital Assessment & Online Learning', 'Navigates digital test modules with confidence, accuracy, and efficiency.', 'Technical Skill', 39);

-- 5. Row level security ----------------------------------------------------
alter table grade_scales enable row level security;
alter table class_bands enable row level security;
alter table report_comments enable row level security;

create policy "signed-in users view grade_scales" on grade_scales for select using (auth.uid() is not null);
create policy "admin-like manage grade_scales" on grade_scales for all using (is_admin_like());

create policy "signed-in users view class_bands" on class_bands for select using (auth.uid() is not null);
create policy "admin-like manage class_bands" on class_bands for all using (is_admin_like());

create policy "signed-in users view report_comments" on report_comments for select using (auth.uid() is not null);
create policy "admin-like manage report_comments" on report_comments for all using (is_admin_like());
