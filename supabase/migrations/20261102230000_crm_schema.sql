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
