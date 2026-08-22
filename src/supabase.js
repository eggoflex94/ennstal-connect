-- ==========================================
-- ENNSTAL CONNECT – GRUNDSTRUKTUR
-- ==========================================

create extension if not exists "uuid-ossp";

-- ==========================================
-- PROFILE
-- ==========================================

create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,

  nickname text unique not null,

  role text default 'member'
    check (role in ('member', 'admin', 'main_admin')),

  is_approved boolean default false,

  is_supporter boolean default false,

  points integer default 0,
  purchase_points integer default 0,

  nickname_color text default 'gray'
    check (nickname_color in ('gray', 'black', 'red')),

  is_online boolean default false,

  last_seen timestamptz default now(),

  total_online_minutes integer default 0,

  last_reward_claim timestamptz,
  last_bonus_claim timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ==========================================
-- ADMIN-RECHTE
-- ==========================================

create table if not exists public.admin_permissions (
  id uuid default uuid_generate_v4() primary key,

  admin_id uuid references public.profiles(id) on delete cascade,

  manage_members boolean default false,
  approve_members boolean default false,
  manage_points boolean default false,
  manage_news boolean default false,
  manage_posts boolean default false,
  manage_messages boolean default false,
  manage_supporters boolean default false,
  manage_admins boolean default false,

  created_at timestamptz default now(),

  unique(admin_id)
);

-- ==========================================
-- FREUNDSCHAFTEN
-- ==========================================

create table if not exists public.friend_requests (
  id uuid default uuid_generate_v4() primary key,

  sender_id uuid references public.profiles(id) on delete cascade,
  receiver_id uuid references public.profiles(id) on delete cascade,

  status text default 'pending'
    check (status in ('pending', 'accepted', 'declined')),

  created_at timestamptz default now(),

  check (sender_id <> receiver_id)
);

-- ==========================================
-- PRIVATE NACHRICHTEN
-- ==========================================

create table if not exists public.messages (
  id uuid default uuid_generate_v4() primary key,

  sender_id uuid references public.profiles(id) on delete cascade,
  receiver_id uuid references public.profiles(id) on delete cascade,

  content text not null,

  is_read boolean default false,

  created_at timestamptz default now()
);

-- ==========================================
-- PUNKTEVERLAUF
-- ==========================================

create table if not exists public.point_history (
  id uuid default uuid_generate_v4() primary key,

  user_id uuid references public.profiles(id) on delete cascade,

  amount integer not null,

  reason text,

  created_at timestamptz default now()
);

-- ==========================================
-- PROFILBESUCHE
-- ==========================================

create table if not exists public.profile_visits (
  id uuid default uuid_generate_v4() primary key,

  profile_id uuid references public.profiles(id) on delete cascade,

  visitor_id uuid references public.profiles(id) on delete cascade,

  created_at timestamptz default now()
);

-- ==========================================
-- ONLINE-ZEIT
-- ==========================================

create table if not exists public.online_sessions (
  id uuid default uuid_generate_v4() primary key,

  user_id uuid references public.profiles(id) on delete cascade,

  started_at timestamptz default now(),

  ended_at timestamptz,

  duration_minutes integer default 0
);

-- ==========================================
-- NEWS
-- ==========================================

create table if not exists public.news (
  id uuid default uuid_generate_v4() primary key,

  author_id uuid references public.profiles(id) on delete set null,

  title text not null,

  content text not null,

  created_at timestamptz default now()
);

-- ==========================================
-- COMMUNITY-BEITRÄGE
-- ==========================================

create table if not exists public.posts (
  id uuid default uuid_generate_v4() primary key,

  author_id uuid references public.profiles(id) on delete cascade,

  content text not null,

  created_at timestamptz default now(),

  updated_at timestamptz default now()
);

-- ==========================================
-- MARKTPLATZ
-- ==========================================

create table if not exists public.marketplace_items (
  id uuid default uuid_generate_v4() primary key,

  name text not null,

  description text,

  price integer not null,

  item_type text not null,

  is_active boolean default true,

  created_at timestamptz default now()
);

-- ==========================================
-- GEKAUFTE MARKTPLATZ-ARTIKEL
-- ==========================================

create table if not exists public.user_purchases (
  id uuid default uuid_generate_v4() primary key,

  user_id uuid references public.profiles(id) on delete cascade,

  item_id uuid references public.marketplace_items(id) on delete cascade,

  purchased_at timestamptz default now(),

  unique(user_id, item_id)
);

-- ==========================================
-- NICKNAME-FARBE
-- Standard = grau
-- Kaufbar = schwarz
-- Admin = rot
-- ==========================================

insert into public.marketplace_items
(name, description, price, item_type)
values
(
  'Schwarze Nickname-Farbe',
  'Ändert deine Nickname-Farbe von Grau auf Schwarz.',
  100,
  'nickname_color'
)
on conflict do nothing;
