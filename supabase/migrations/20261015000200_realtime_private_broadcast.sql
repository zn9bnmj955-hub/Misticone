-- Live updates use private Realtime channels (Realtime Authorization):
-- everyone may listen to "tournament:CODE", nobody but the server may send.
-- The server broadcasts with the secret key (service role bypasses RLS), so
-- no insert policy is granted: a visitor holding the public key can no longer
-- push fake "update" messages that make every spectator reload in a loop.
drop policy if exists "anyone listens to tournament updates" on realtime.messages;
create policy "anyone listens to tournament updates" on realtime.messages
  for select to anon, authenticated
  using (realtime.topic() like 'tournament:%' and extension = 'broadcast');
