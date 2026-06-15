import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/config'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const folderId  = searchParams.get('folderId')
  const pageToken = searchParams.get('pageToken') || undefined
  const projectId = searchParams.get('projectId') || undefined

  if (!folderId) {
    return NextResponse.json({ error: 'folderId é obrigatório' }, { status: 400 })
  }

  const email  = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!email || !rawKey) {
    return NextResponse.json(
      { error: 'Credenciais do Google Drive não configuradas. Defina GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.' },
      { status: 503 }
    )
  }

  // Env vars store literal \n — convert to real newlines
  const key = rawKey.replace(/\\n/g, '\n')

  try {
    const auth = new google.auth.JWT({
      email,
      key,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    })

    const drive = google.drive({ version: 'v3', auth })

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink)',
      pageSize: 50,
      orderBy: 'folder,name',
      pageToken,
    })

    const files = (res.data.files || []).map(f => ({
      id:           f.id!,
      name:         f.name!,
      mimeType:     f.mimeType || 'application/octet-stream',
      size:         f.size || null,
      modifiedTime: f.modifiedTime || null,
      webViewLink:  f.webViewLink || null,
    }))

    // Register non-folder files in drive_events (first sync only — duplicates ignored)
    if (projectId) {
      try {
        const supabase = createClient(supabaseUrl(), supabaseAnonKey())
        const toRecord = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
        if (toRecord.length > 0) {
          await supabase.from('drive_events').upsert(
            toRecord.map(f => ({
              file_id:   f.id,
              file_name: f.name,
              action:    'sync',
              mime_type: f.mimeType,
              project_id: projectId,
            })),
            { onConflict: 'file_id,project_id', ignoreDuplicates: true }
          )
        }
      } catch {
        // Non-blocking: Drive listing still succeeds even if event recording fails
      }
    }

    return NextResponse.json({ files, nextPageToken: res.data.nextPageToken || null })
  } catch (error: any) {
    console.error('[drive/files]', error)
    return NextResponse.json(
      { error: error.message || 'Falha ao listar arquivos do Drive' },
      { status: 500 }
    )
  }
}
