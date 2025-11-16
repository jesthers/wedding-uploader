import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import { google, drive_v3 } from 'googleapis';
import type { Credentials } from 'google-auth-library';
import { PassThrough } from 'stream';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOAuthClient } from './googleClient';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const MAX_FILES = 40;
const MAX_FILE_SIZE_MB = 20;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_FILES,
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
  },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tokensPath = path.resolve(__dirname, '../tokens.json');

const requiredEnv = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_DRIVE_PARENT_FOLDER_ID',
];

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.warn(`Missing environment variable: ${key}`);
  }
});

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token || tokens.access_token) {
    const merged = {
      ...oauth2Client.credentials,
      ...tokens,
    };
    saveTokens(merged).catch((error) =>
      console.error('Failed to persist refreshed tokens', error),
    );
  }
});

loadTokens();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).send('Google OAuth 환경 변수가 설정되지 않았습니다.');
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
  });

  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  if (!code || typeof code !== 'string') {
    return res.status(400).send('Authorization code가 없습니다.');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    await saveTokens(oauth2Client.credentials);

    res.send(`
      <html>
        <head><meta charset="utf-8" /></head>
        <body style="font-family: system-ui; text-align: center; padding: 2rem;">
          <h1>Google Drive 연동 완료</h1>
          <p>이 창은 닫으셔도 됩니다.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error', error);
    res.status(500).send('토큰을 발급받는 중 문제가 발생했습니다. 로그를 확인해주세요.');
  }
});

app.post('/api/upload', upload.array('files[]'), async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const files = req.files as Express.Multer.File[] | undefined;

  if (!name) {
    return res.status(400).json({ success: false, message: '이름을 입력해주세요.' });
  }

  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, message: '최소 한 개의 사진을 선택해주세요.' });
  }

  const sanitizedName = sanitizeFolderName(name);

  try {
    const drive = await getDriveFromEnvOrTokens();
    const folderId = await getOrCreateFolder(drive, sanitizedName);

    await Promise.all(
      files.map((file, index) => uploadFileToDrive(drive, folderId, file, index)),
    );

    res.json({ success: true, folderName: sanitizedName });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : '업로드 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    });
  }
});

// Multer/Express error handler for file size and others
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: `파일당 최대 ${MAX_FILE_SIZE_MB}MB까지만 업로드할 수 있습니다.`,
    });
  }
  if (err) {
    return res.status(500).json({
      success: false,
      message: '업로드 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  // 프로덕션에서는 GOOGLE_REFRESH_TOKEN이 존재하면 바로 동작
  if (!process.env.GOOGLE_REFRESH_TOKEN && !oauth2Client.credentials.refresh_token) {
    console.warn('Google OAuth가 아직 연동되지 않았습니다. /auth/google 에 접속해 승인하세요.');
  }
});

let driveCache: drive_v3.Drive | null = null;
async function getDriveFromEnvOrTokens(): Promise<drive_v3.Drive> {
  if (driveCache) return driveCache;
  const auth = getOAuthClient();
  driveCache = google.drive({ version: 'v3', auth });
  return driveCache;
}

async function getOrCreateFolder(drive: drive_v3.Drive, folderName: string) {
  const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
  if (!parentFolderId) {
    throw new Error('GOOGLE_DRIVE_PARENT_FOLDER_ID 환경 변수가 없습니다.');
  }

  const escaped = folderName.replace(/'/g, "\\'");
  const existing = await drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and name='${escaped}'`,
    fields: 'files(id, name)',
    pageSize: 1,
  });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id as string;
  }

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id',
  });

  if (!created.data.id) {
    throw new Error('폴더를 생성하지 못했습니다.');
  }

  return created.data.id;
}

async function uploadFileToDrive(
  drive: drive_v3.Drive,
  folderId: string,
  file: Express.Multer.File,
  index: number,
) {
  const timestamp = Date.now();
  const safeOriginalName = file.originalname.replace(/[^\w.() -]/g, '_');
  const fileName = `${timestamp}-${index}-${safeOriginalName}`;

  await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: file.mimetype,
      body: bufferToStream(file.buffer),
    },
    fields: 'id, name',
  });
}

function sanitizeFolderName(name: string) {
  return name
    .replace(/[/\\<>:"|?*\x00-\x1f]/g, '')
    .trim()
    .slice(0, 255) || '게스트';
}

function bufferToStream(buffer: Buffer) {
  const stream = new PassThrough();
  stream.end(buffer);
  return stream;
}

async function loadTokens() {
  try {
    const raw = await fs.readFile(tokensPath, 'utf-8');
    const tokens = JSON.parse(raw);
    oauth2Client.setCredentials(tokens);
    console.log('Google OAuth 토큰을 불러왔습니다.');
  } catch (error) {
    console.warn('tokens.json 파일이 없습니다. 먼저 /auth/google 에 접속해 승인하세요.');
  }
}

async function saveTokens(tokens: Credentials | null) {
  if (!tokens) return;
  await fs.writeFile(tokensPath, JSON.stringify(tokens, null, 2), 'utf-8');
  console.log('Google OAuth 토큰이 tokens.json 파일에 저장되었습니다.');
}
