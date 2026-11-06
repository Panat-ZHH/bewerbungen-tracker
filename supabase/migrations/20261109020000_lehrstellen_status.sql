-- Lehrstellen status pipeline (P0 item 5/24): additive only.
-- applications.status is free text without a check constraint, so the new status values
--   schnupper_planned, schnupper_done, aptitude_test, contract_signed
-- need no schema change; existing rows ('rejected' now labelled "Absage erhalten", 'offer' = "Zusage") are untouched.

-- Separate data for the trial day (Schnupperlehre) and the aptitude test (Eignungstest / Multicheck).
alter table public.applications add column if not exists schnupper_date date;
alter table public.applications add column if not exists schnupper_result text;
alter table public.applications add column if not exists schnupper_notes text;
alter table public.applications add column if not exists test_date date;
alter table public.applications add column if not exists test_result text;

alter table public.applications drop constraint if exists applications_schnupper_result_check;
alter table public.applications add constraint applications_schnupper_result_check
  check (schnupper_result is null or schnupper_result in ('positive', 'neutral', 'negative')) not valid;
alter table public.applications drop constraint if exists applications_test_result_check;
alter table public.applications add constraint applications_test_result_check
  check (test_result is null or test_result in ('pending', 'passed', 'failed')) not valid;
alter table public.applications drop constraint if exists applications_schnupper_notes_len;
alter table public.applications add constraint applications_schnupper_notes_len
  check (schnupper_notes is null or char_length(schnupper_notes) <= 4000) not valid;

-- The map reward for a submitted application also applies to the new "sent" steps (test, signed contract).
-- A Schnupperlehre alone is not an application and earns nothing.
create or replace function public.reward_submitted_application()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rewarded text;
begin
  if new.user_id is null or not (new.applied_at is not null or new.status in ('applied', 'aptitude_test', 'interview', 'final_interview', 'offer', 'contract_signed', 'rejected')) then
    return new;
  end if;
  insert into public.map_application_rewards (user_id, application_id) values (new.user_id, new.id)
    on conflict do nothing returning application_id into rewarded;
  if rewarded is not null then
    insert into public.map_wallets (user_id, balance, earned) values (new.user_id, 100, 100)
      on conflict (user_id) do update set balance = public.map_wallets.balance + 100, earned = public.map_wallets.earned + 100;
  end if;
  return new;
end;
$$;
