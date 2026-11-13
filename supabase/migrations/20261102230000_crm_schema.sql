-- CRM Émounatéha : schéma relationnel
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.templates (
  id text primary key,
  name text not null,
  subject text not null default '',
  preheader text not null default '',
  title text not null default '',
  body text not null default '',
  button_text text not null default '',
  button_url text not null default '',
  color text not null default '#1f6a72',
  accent text not null default '#c4a24a',
  created_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id text primary key,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active','unsubscribed','bounced','converted')),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists contacts_email_uidx on public.contacts (lower(email));
create index if not exists contacts_tags_idx on public.contacts using gin (tags);

create table if not exists public.campaigns (
  id text primary key,
  name text not null,
  audience_tag text not null default '',
  status text not null default 'draft' check (status in ('draft','running','paused','done')),
  steps jsonb not null default '[]'::jsonb,   -- [{templateId, delayDays}]
  created_at timestamptz not null default now()
);

create table if not exists public.sends (
  id text primary key,
  at timestamptz not null default now(),
  campaign_id text,
  contact_id text,
  email text not null,
  step_index int not null default 0,
  template_id text,
  status text not null check (status in ('sent','simulated','error')),
  message_id text,
  error text,
  quota boolean not null default false
);
create index if not exists sends_contact_idx on public.sends (contact_id);
create index if not exists sends_campaign_idx on public.sends (campaign_id);
create index if not exists sends_at_idx on public.sends (at desc);

-- Sécurité : RLS active, aucune policy => inaccessible via la clé publique (seul le serveur avec la base y accède)
alter table public.settings  enable row level security;
alter table public.templates enable row level security;
alter table public.contacts  enable row level security;
alter table public.campaigns enable row level security;
alter table public.sends     enable row level security;

-- Campagnes programmées (démarrage à une date, ex. X jours avant une fête)
alter table public.campaigns add column if not exists start_date text not null default '';
alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check check (status in ('draft','scheduled','running','paused','done'));

-- Templates par fête
alter table public.templates add column if not exists holiday text not null default '';

alter table public.campaigns add column if not exists end_date text not null default '';

-- Diffusion de la Torah : une image (JPEG) par jour, publiée depuis le back-office
create table if not exists public.diffusion (
  id text primary key,
  day date not null,
  name text not null default '',
  data bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists diffusion_day_idx on public.diffusion (day desc);
alter table public.diffusion enable row level security;

alter table public.diffusion add column if not exists youtube text not null default '';

-- Utilisateurs du CRM (connexion par mot de passe, invitation par email)
create table if not exists public.crm_users (
  id text primary key,
  email text not null,
  role text not null default 'admin',
  password_hash text,
  invite_hash text,
  invite_expires timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists crm_users_email_uidx on public.crm_users (lower(email));
alter table public.crm_users enable row level security;

-- Diffusion : l'image devient facultative (entrées « vidéo de Tanya seule » importées des archives)
alter table public.diffusion alter column data drop not null;

-- Ambassadeurs (ambassadeur.emounateha.fr) : personnes qui relaient la diffusion de la Torah et la collecte
create table if not exists public.ambassadors (
  id text primary key,
  first_name text not null default '',
  last_name text not null default '',
  email text not null,
  phone text not null default '',
  city text not null default '',
  missions text[] not null default '{}',   -- 'torah', 'dons', 'colis'
  message text not null default '',
  status text not null default 'new' check (status in ('new','contacted','active','inactive')),
  created_at timestamptz not null default now()
);
create unique index if not exists ambassadors_email_uidx on public.ambassadors (lower(email));
alter table public.ambassadors enable row level security;
-- Ambassadeurs : lien personnel ambassadeur.emounateha.fr/<slug> (suivi des dons) et code postal
alter table public.ambassadors add column if not exists slug text;
alter table public.ambassadors add column if not exists cp text not null default '';
create unique index if not exists ambassadors_slug_uidx on public.ambassadors (slug);

-- Numéro de version des données du CRM : augmenté à chaque écriture (d'où qu'elle vienne) par un déclencheur.
-- Le serveur ne relit toute la base que si ce numéro a changé (au lieu de tout relire à chaque requête : bande passante Supabase).
create table if not exists public.crm_version (id int primary key default 1 check (id = 1), v bigint not null default 0);
insert into public.crm_version (id, v) values (1, 0) on conflict (id) do nothing;
alter table public.crm_version enable row level security;
create or replace function public.crm_bump() returns trigger language plpgsql set search_path = '' as $$
begin update public.crm_version set v = v + 1 where id = 1; return null; end $$;
do $$ declare t text; begin
  foreach t in array array['settings', 'templates', 'contacts', 'campaigns', 'sends'] loop
    if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'crm_bump_' || t and tgrelid = ('public.' || t)::regclass) then
      execute format('create trigger %I after insert or update or delete or truncate on public.%I for each statement execute function public.crm_bump()', 'crm_bump_' || t, t);
    end if;
  end loop;
end $$;

-- Recherche de doublon avant chaque envoi (campagne + contact + modèle)
create index if not exists sends_dedupe_idx on public.sends (campaign_id, contact_id, template_id);
