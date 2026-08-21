-- Hotfix curto — Luiza/WhatsApp/privacidade.
--
-- 1) luizia_wa_phone_rules era usada tanto para contatos individuais quanto
--    para grupos, sem nenhuma marca estrutural — resolverTelefoneDoProfile()
--    (avisos pessoais, "me avise") podia devolver um GRUPO como "meu
--    WhatsApp". Evidência real: dados já existentes no banco mostram phones
--    como "120363426123042547-group" — o próprio Z-API/WhatsApp já marca
--    grupos dessa forma nos JIDs. Column nova, populada automaticamente pelo
--    webhook a partir de body.isGroup (evidência do provider) a cada
--    mensagem recebida; aqui só o backfill inicial das linhas já existentes,
--    usando a mesma heurística estrutural (nunca por nome) já usada no
--    admin: JID de grupo é longo e/ou começa com 120363.
alter table public.luizia_wa_phone_rules
  add column if not exists is_group boolean not null default false;

update public.luizia_wa_phone_rules
set is_group = true
where phone like '%-group' or phone ~ '^120363' or length(phone) > 20;
