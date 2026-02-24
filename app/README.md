# Voice Bot AI - Desktop App

Ứng dụng Desktop dựa trên **Electron** với giao diện giống hệt web frontend.

## Cấu trúc thư mục

```
app/
├── electron/           # Electron main & preload process
│   ├── main.ts         # Main process - tạo cửa sổ BrowserWindow
│   └── preload.ts      # Preload script - bridge IPC APIs
├── src/                # React UI (giống frontend/)
│   ├── components/
│   │   ├── TitleBar.tsx        # ⭐ Custom title bar cho desktop
│   │   ├── Header.tsx
│   │   ├── AvatarSection.tsx
│   │   ├── AudioVisualizer.tsx
│   │   ├── MessageList.tsx
│   │   └── Settings.tsx
│   ├── hooks/
│   │   └── useAudioStream.ts
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   └── types.ts
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── tsconfig.node.json
```

## Cài đặt & Chạy

### 1. Cài dependencies

```bash
cd app
npm install
```

### 2. Chạy dev (Electron + Vite hot-reload)

```bash
npm run dev
```

Vite sẽ khởi động dev server, sau đó Electron sẽ mở cửa sổ desktop với hot-reload.

### 3. Build production

```bash
npm run electron:build
```

File cài đặt sẽ được tạo trong thư mục `release/`.

## Khác biệt so với Web Frontend

| Tính năng | Web (`/frontend`) | Desktop (`/app`) |
|---|---|---|
| Nền tảng | Browser | Electron (Windows/Mac/Linux) |
| Title bar | Browser native | Custom title bar (min/max/close) |
| Badge | Không | Hiển thị badge "Desktop" |
| Cấu trúc | Vite + React | Electron + Vite + React |
| Port dev | 5173 | 5174 |

## Lưu ý

- Backend vẫn cần chạy tại `localhost:8000` để kết nối WebSocket
- Emoji assets được load từ `http://localhost:8000/emojis/`
- Settings được lưu trong `localStorage` (persistent trong Electron)
