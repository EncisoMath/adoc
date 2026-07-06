-- Opcional: ejecutar solo si la app no puede subir/abrir soportes por permisos de Supabase Storage.
-- Modelo consistente con las policies actuales del proyecto: cualquier usuario autenticado puede leer/escribir en el bucket.

insert into storage.buckets (id, name, public)
values ('asistencia-ggm', 'asistencia-ggm', false)
on conflict (id) do update set public = false;

drop policy if exists "asistencia_ggm_storage_authenticated_select" on storage.objects;
drop policy if exists "asistencia_ggm_storage_authenticated_insert" on storage.objects;
drop policy if exists "asistencia_ggm_storage_authenticated_update" on storage.objects;
drop policy if exists "asistencia_ggm_storage_authenticated_delete" on storage.objects;

create policy "asistencia_ggm_storage_authenticated_select"
on storage.objects
for select
to authenticated
using (bucket_id = 'asistencia-ggm');

create policy "asistencia_ggm_storage_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'asistencia-ggm');

create policy "asistencia_ggm_storage_authenticated_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'asistencia-ggm')
with check (bucket_id = 'asistencia-ggm');

create policy "asistencia_ggm_storage_authenticated_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'asistencia-ggm');
