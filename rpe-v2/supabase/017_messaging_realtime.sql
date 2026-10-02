-- Cross-app messaging realtime read access.
-- Writes remain protected behind the ranova-messaging Edge Function.

grant select on public.ranova_conversations to authenticated;
grant select on public.ranova_messages to authenticated;
grant select on public.ranova_quotes to authenticated;

drop policy if exists "participants can read conversations" on public.ranova_conversations;
create policy "participants can read conversations"
on public.ranova_conversations
for select
to authenticated
using ((select auth.uid()) = buyer_user_id or (select auth.uid()) = seller_user_id);

drop policy if exists "participants can read messages" on public.ranova_messages;
create policy "participants can read messages"
on public.ranova_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.ranova_conversations c
    where c.id = ranova_messages.conversation_id
      and ((select auth.uid()) = c.buyer_user_id or (select auth.uid()) = c.seller_user_id)
  )
);

drop policy if exists "participants can read quotes" on public.ranova_quotes;
create policy "participants can read quotes"
on public.ranova_quotes
for select
to authenticated
using ((select auth.uid()) = buyer_user_id or (select auth.uid()) = seller_user_id);

alter publication supabase_realtime add table public.ranova_conversations;
alter publication supabase_realtime add table public.ranova_messages;
alter publication supabase_realtime add table public.ranova_quotes;
