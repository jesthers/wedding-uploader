import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

export function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  // 1) 프로덕션 환경변수 (Vercel 등)
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return client;
  }

  // 2) 로컬 tokens.json (backend 루트 기준)
  try {
    const tokensPath = path.resolve(process.cwd(), 'backend', 'tokens.json');
    const altPath = path.resolve(process.cwd(), 'tokens.json'); // 혹시 루트에 둘 경우 대비
    const target = fs.existsSync(tokensPath) ? tokensPath : altPath;
    const raw = fs.readFileSync(target, 'utf8');
    const tokens = JSON.parse(raw);
    client.setCredentials(tokens);
  } catch {
    // tokens.json이 없을 수 있음 - /auth/google 통해 최초 발급 필요(로컬)
  }

  return client;
}


