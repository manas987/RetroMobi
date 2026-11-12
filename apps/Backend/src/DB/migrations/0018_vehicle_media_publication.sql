alter table vehicle_media add column published boolean not null default false
  check (not published or type = 'IMAGE');
