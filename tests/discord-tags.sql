-- Run against a migrated database; all assertions roll back.
begin;
do $$
begin
  if private.hive_discord_tag('{"name":".test_user#0","full_name":".test_user","custom_claims":{"global_name":"Display Name"}}') <> '.test_user' then
    raise exception 'Modern username must retain punctuation and remove only the legacy #0 marker';
  end if;
  if private.hive_discord_tag('{"name":"TestUser#1234","full_name":"TestUser","preferred_username":"Wrong display"}') <> 'TestUser#1234' then
    raise exception 'Legacy discriminator must remain intact';
  end if;
  if private.hive_discord_tag('{"full_name":"fallback.user","custom_claims":{"global_name":"Display Name"}}') <> 'fallback.user' then
    raise exception 'Full username fallback failed';
  end if;
  if private.hive_discord_tag('{"preferred_username":"OldUser#9876"}') <> 'OldUser#9876' then
    raise exception 'Older identity fallback failed';
  end if;
  if private.hive_discord_tag('{"custom_claims":{"global_name":"Display Name"}}') is not null then
    raise exception 'Display names cannot substitute for an unknown tag';
  end if;
  if has_function_privilege('anon','private.hive_discord_tag(jsonb)','EXECUTE')
    or has_function_privilege('authenticated','private.hive_discord_tag(jsonb)','EXECUTE') then
    raise exception 'Tag helper must remain private';
  end if;
  if exists(select 1 from public.hive_public_roster() r where to_jsonb(r) ? 'discord_name') then
    raise exception 'Discord tags must not appear in the public roster';
  end if;
end;
$$;
rollback;
