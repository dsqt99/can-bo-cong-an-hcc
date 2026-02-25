/**
 * Centralized API Configuration
 * 
 * Handles dynamic URL resolution for all environments:
 * 1. VITE_API_URL env variable (explicit override - highest priority)
 * 2. Local development (localhost/127.0.0.1) → same host with backend port 8668
 * 3. Public domain (deployed via reverse proxy) → same origin as frontend
 * 
 * This ensures the app works seamlessly in:
 * - Local development (npm run dev)
 * - Docker Compose deployment
 * - Public domain deployment (with nginx/reverse proxy)
 */

const BACKEND_PORT = '8668';

function resolveApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;

  // 1. Explicit env variable takes highest priority
  if (envUrl && envUrl.trim() !== '') {
    // Remove trailing slash for consistency
    return envUrl.replace(/\/+$/, '');
  }

  // 2. Local development → backend on same host, different port
  const { hostname, protocol } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

  if (isLocal) {
    return `${protocol}//${hostname}:${BACKEND_PORT}`;
  }

  // 3. Public domain → assume reverse proxy routes /api, /ws, /emojis to backend
  //    Use same origin as the current page
  return window.location.origin;
}

/** HTTP(S) base URL for API calls (e.g., "http://localhost:8668" or "https://chatbot.example.com") */
export const API_BASE_URL = resolveApiBaseUrl();

/** WebSocket URL for real-time chat (e.g., "ws://localhost:8668/ws/chat") */
export const WS_CHAT_URL = API_BASE_URL
  .replace(/^http:/, 'ws:')
  .replace(/^https:/, 'wss:') + '/ws/chat';

/** Base URL for emoji assets */
export const EMOJI_BASE_URL = `${API_BASE_URL}/emojis`;

/** TTS API endpoint */
export const TTS_API_URL = `${API_BASE_URL}/api/tts`;
