-- O bucket compartilhado ja e usado pelos componentes de fotos da obra e do Feed.
-- Mantem PDF e habilita os formatos de imagem usados por navegadores e celulares.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]
where id = 'project-files';
