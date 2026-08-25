-- Run in Supabase SQL Editor (new snippet)

alter table recurring_fee_payments add column if not exists amount numeric(10,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tuition_payments_student_date_unique'
  ) then
    alter table tuition_payments
      add constraint tuition_payments_student_date_unique unique (student_id, paid_on);
  end if;
end $$;
