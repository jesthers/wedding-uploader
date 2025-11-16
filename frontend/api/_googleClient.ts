import { google } from 'googleapis';

export function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN! });
  return client;
}

export function getDrive() {
  const auth = getOAuthClient();
  return google.drive({ version: 'v3', auth });
}


