create table if not exists dent_analyses (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  file_name text not null,
  media_type text not null,
  vehicle_detected boolean not null,
  overall_condition text not null,
  dents_count integer not null,
  result jsonb not null
);
