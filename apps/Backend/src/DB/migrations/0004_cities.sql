create table cities (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  state      text not null,
  slug       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into cities (name, state, slug) values
  ('Dehradun', 'Uttarakhand', 'dehradun'),
  ('Haridwar', 'Uttarakhand', 'haridwar'),
  ('Rishikesh', 'Uttarakhand', 'rishikesh');
