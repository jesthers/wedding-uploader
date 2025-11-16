import type { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';
import { getDrive } from './_googleClient';
import { Readable } from 'stream';

export const config = {
  api: { bodyParser: false },
  runtime: 'nodejs',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1) POST가 아니면 즉시 응답하고 어떤 초기화도 하지 않는다.
  if (req.method !== 'POST') {
    return res.status(200).send('upload endpoint is alive. use POST.');
  }

  // 2) POST일 때만 Drive 클라이언트를 준비한다.
  const drive = getDrive();
  let guestName = '';
  const files: Array<{ filename: string; mime: string; buffer: Buffer }> = [];

  try {
    await new Promise<void>((resolve, reject) => {
      const bb: any = Busboy({ headers: req.headers as any });
      bb.on('field', (name: string, val: string) => {
        if (name === 'name') guestName = (val || '').trim();
      });
      bb.on('file', (_name: string, file: NodeJS.ReadableStream, info: { filename: string; mimeType: string }) => {
        const chunks: Buffer[] = [];
        file.on('data', (d: Buffer) => chunks.push(d));
        file.on('end', () => {
          files.push({ filename: info.filename, mime: info.mimeType, buffer: Buffer.concat(chunks) });
        });
      });
      bb.on('error', (err: any) => reject(err));
      bb.on('close', () => resolve());
      (req as any).pipe(bb);
    });

    if (!guestName) return res.status(400).json({ ok: false, message: 'name is required' });
    if (!files.length) return res.status(400).json({ ok: false, message: 'no files' });

    const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID!;
    const folderId = await ensureGuestFolder(drive, parentId, guestName);

    await Promise.all(
      files.map((file) =>
        drive.files.create({
          requestBody: { name: file.filename, parents: [folderId], mimeType: file.mime },
          media: { mimeType: file.mime, body: BufferToStream(file.buffer) as any },
        }),
      ),
    );

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, message: e?.message || 'upload failed' });
  }
}

function BufferToStream(buf: Buffer) {
  const r = new Readable();
  r.push(buf);
  r.push(null);
  return r;
}

async function ensureGuestFolder(drive: any, parentId: string, name: string): Promise<string> {
  const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
  const { data } = await drive.files.list({ q, fields: 'files(id,name)' });
  if (data.files?.[0]?.id) return data.files[0].id;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id,name',
  });
  return created.data.id!;
}


