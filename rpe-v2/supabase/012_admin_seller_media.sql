alter table public.ranova_admin_seller_messages
  add column if not exists media_type text,
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists mime_type text;

alter table public.ranova_admin_seller_messages
  add constraint ranova_admin_seller_media_type_check
  check (media_type is null or media_type in ('image','file','audio'));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('admin-seller-media','admin-seller-media',false,15728640,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
