# Wedding QR Photo Upload

모바일로 QR 코드를 스캔한 하객들이 손쉽게 사진을 올릴 수 있는 단일 페이지 웹앱입니다. 
Google OAuth2를 통해 **관리자 계정으로 한 번만 로그인**하면 이후에는 토큰이 서버에 저장되어 
하객은 어떤 인증도 볼 필요 없이 Google Drive로 바로 업로드됩니다.

## 주요 기능
- 모바일 퍼스트 React + Tailwind UI (이름 입력, 사진 선택, 썸네일 미리보기, 업로드 상태 표시)
- Express 백엔드에서 OAuth2 + Google Drive API로 업로드 처리
- 이름별 폴더 자동 생성/재사용 (`GOOGLE_DRIVE_PARENT_FOLDER_ID` 하위)
- OAuth 토큰을 `backend/tokens.json`에 안전하게 저장하여 재사용

## 프로젝트 구조
```
weddingQR/
├── frontend/          # React + Vite + Tailwind
├── backend/           # Express + Google OAuth2 + Drive 업로드
└── README.md
```

## 사전 준비
1. **Google Cloud 프로젝트 생성** 후 OAuth 동의 화면을 설정합니다.
2. **OAuth 2.0 클라이언트 ID** (웹 애플리케이션) 생성
   - 승인된 리다이렉트 URI에 `http://localhost:4000/auth/google/callback` 추가 (개발 환경 예시)
3. **Google Drive API**를 활성화합니다.
4. 업로드 대상이 될 Google Drive 폴더를 하나 만들고 폴더 ID를 확인합니다.

## 환경 변수 설정
`backend/.env.example`을 복사하여 `.env`를 생성하고 값을 입력하세요.
```
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback
GOOGLE_DRIVE_PARENT_FOLDER_ID=your-parent-folder-id
PORT=4000
```
> `.env`와 `tokens.json`은 절대 버전 관리에 올리지 마세요.

## 의존성 설치
```
# Frontend
cd frontend
npm install

# Backend
cd ../backend
npm install
```

## 개발 서버 실행
두 개의 터미널을 사용합니다.

**1) Backend (포트 4000, 기본값)**
```
cd backend
npm run dev
```

**2) Frontend (포트 3000)**
```
cd frontend
npm run dev
```

브라우저에서 `http://localhost:3000`을 열면 UI를 볼 수 있습니다.

### Google OAuth 최초 연동 (로컬)
백엔드를 켠 상태에서 관리자만 아래 주소에 접속합니다.
```
http://localhost:4000/auth/google
```
승인을 마치면 `backend/tokens.json`에 OAuth 토큰이 저장되고, 
이후에는 서버가 자동으로 access token을 갱신하면서 업로드를 처리합니다.

### Vercel(프로덕션) 배포 시
Vercel은 디스크가 휘발성이라 `tokens.json`을 사용할 수 없습니다. 대신 아래 환경변수를 설정하세요.

필수:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (프로덕션 콜백 URL)
- `GOOGLE_DRIVE_PARENT_FOLDER_ID`
- `GOOGLE_REFRESH_TOKEN` ← 로컬에서 발급받은 refresh_token 값을 복사하여 설정

서버는 `GOOGLE_REFRESH_TOKEN`이 존재하면 이를 우선 사용하여 바로 업로드가 동작합니다. 하객은 OAuth 화면을 볼 필요 없이 `/api/upload`만 사용하면 됩니다.

## 배포 & 프로덕션 빌드
1. **Frontend**
   ```
   cd frontend
   npm run build
   ```
   `frontend/dist`를 원하는 정적 호스팅(Nginx, CloudFront 등)에 배포합니다.

2. **Backend**
   - 프로덕션 서버에 `backend` 폴더를 배치하고 `.env`, `tokens.json`을 함께 업로드합니다.
   - `npm install --production` 실행 후 `npm run start`로 서버를 띄우세요.
   - 프록시/리버스 프록시(Nginx 등)로 HTTPS와 도메인 연결을 설정합니다.

## OAuth 토큰 관리
- 최초 승인 후 생성된 `backend/tokens.json`은 민감 정보이므로 안전하게 보관하세요.
- 토큰이 만료되거나 삭제되면 `/auth/google`에 다시 접속하여 갱신할 수 있습니다.

## Trouble Shooting
- **"Google OAuth가 아직 연동되지 않았습니다"**: `/auth/google` 승인 여부 확인.
- **권한 오류**: Google Cloud 콘솔에서 Drive API가 활성화되어 있는지 확인하세요.
- **업로드 실패**: 백엔드 로그를 확인해 파일 크기 제한(기본 20MB)이나 네트워크 문제를 점검하세요.

행복한 결혼식 되시길 바라요! 🎉
