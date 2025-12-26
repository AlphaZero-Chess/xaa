// Browser API Service - Real backend integration
// NOTE (hardening): we intentionally do NOT fall back to a hardcoded '/api'.
// All requests must use REACT_APP_BACKEND_URL.
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const requireBackendUrl = () => {
  if (!BACKEND_URL) {
    // Keep UI running, but make API calls fail loudly and consistently.
    throw new Error(
      "Missing REACT_APP_BACKEND_URL. Set it in your environment (must include '/api' prefix).",
    );
  }

  // Guard rail:
  // If the app is deployed (e.g. on Vercel) and the backend URL is a relative path (like '/api'),
  // requests will go to the frontend origin and typically return index.html (HTML) -> JSON parse errors.
  const isDeployedHost =
    typeof window !== 'undefined' &&
    window.location &&
    window.location.hostname &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1';

  if (isDeployedHost && BACKEND_URL.startsWith('/')) {
    throw new Error(
      "REACT_APP_BACKEND_URL is set to a relative path ('/api') but the app is running on a deployed host. " +
        "Set REACT_APP_BACKEND_URL to your FULL backend URL including '/api' (e.g. https://xaax.onrender.com/api) " +
        "for BOTH Preview and Production on Vercel.",
    );
  }

  return BACKEND_URL;
};

const safeJson = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    // This usually means we got HTML (index.html) instead of JSON.
    throw new Error(
      `Backend returned a non-JSON response (status ${response.status}). ` +
        `This usually means REACT_APP_BACKEND_URL is pointing at the frontend instead of the backend. ` +
        `First 80 chars: ${text.slice(0, 80)}`,
    );
  }
};

const joinUrl = (base, path) => {
  // base can be '/api' or 'https://host/api'.
  const u = new URL(base, window.location.origin);
  const basePath = u.pathname.replace(/\/+$/, "");
  const addPath = path.replace(/^\/+/, "");
  u.pathname = `${basePath}/${addPath}`;
  return u.toString();
};

// Helper to get WebSocket URL for browser streaming.
// We derive WS scheme/host AND preserve the backend base path.
const getWsUrl = () => {
  const apiBase = requireBackendUrl();
  const apiUrl = new URL(apiBase, window.location.origin);
  const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${apiUrl.host}${apiUrl.pathname.replace(/\/+$/, "")}`;
};

// Browser Session APIs
export const browserApi = {
  // Create a new browser session
  createSession: async () => {
    const response = await fetch(joinUrl(requireBackendUrl(), '/browser/session'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const error = await safeJson(response).catch(() => ({}));
      throw new Error(error.detail || 'Failed to create session');
    }
    return safeJson(response);
  },

  // Close a browser session
  closeSession: async (sessionId) => {
    const response = await fetch(joinUrl(requireBackendUrl(), `/browser/session/${sessionId}`), {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await safeJson(response).catch(() => ({}));
      throw new Error(error.detail || 'Failed to close session');
    }
    return safeJson(response);
  },

  // Get session status
  getSessionStatus: async (sessionId) => {
    const response = await fetch(joinUrl(requireBackendUrl(), `/browser/session/${sessionId}/status`));
    if (!response.ok) {
      const error = await safeJson(response).catch(() => ({}));
      throw new Error(error.detail || 'Failed to get session status');
    }
    return safeJson(response);
  },

  // Navigate to URL
  navigate: async (sessionId, url, tabId = null) => {
    const response = await fetch(joinUrl(requireBackendUrl(), `/browser/${sessionId}/navigate`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, tab_id: tabId }),
    });
    if (!response.ok) {
      const error = await safeJson(response).catch(() => ({}));
      throw new Error(error.detail || 'Navigation failed');
    }
    return safeJson(response);
  },

  // Go back
  goBack: async (sessionId, tabId = null) => {
    const path = tabId ? `/browser/${sessionId}/back?tab_id=${encodeURIComponent(tabId)}` : `/browser/${sessionId}/back`;
    const response = await fetch(joinUrl(requireBackendUrl(), path), {
      method: 'POST',
    });
    return safeJson(response);
  },

  // Go forward
  goForward: async (sessionId, tabId = null) => {
    const path = tabId ? `/browser/${sessionId}/forward?tab_id=${encodeURIComponent(tabId)}` : `/browser/${sessionId}/forward`;
    const response = await fetch(joinUrl(requireBackendUrl(), path), {
      method: 'POST',
    });
    return safeJson(response);
  },

  // Refresh page
  refresh: async (sessionId, tabId = null) => {
    const path = tabId ? `/browser/${sessionId}/refresh?tab_id=${encodeURIComponent(tabId)}` : `/browser/${sessionId}/refresh`;
    const response = await fetch(joinUrl(requireBackendUrl(), path), {
      method: 'POST',
    });
    return safeJson(response);
  },

  // Get screenshot
  getScreenshot: async (sessionId, tabId = null) => {
    const path = tabId ? `/browser/${sessionId}/screenshot?tab_id=${encodeURIComponent(tabId)}` : `/browser/${sessionId}/screenshot`;
    const response = await fetch(joinUrl(requireBackendUrl(), path));
    if (!response.ok) {
      throw new Error('Failed to get screenshot');
    }
    return safeJson(response);
  },

  // Tabs (real Playwright pages)
  listTabs: async (sessionId) => {
    const response = await fetch(joinUrl(requireBackendUrl(), `/browser/session/${sessionId}/tabs`));
    if (!response.ok) {
      throw new Error('Failed to list tabs');
    }
    return safeJson(response);
  },

  createTab: async (sessionId, url = null, makeActive = true) => {
    const response = await fetch(joinUrl(requireBackendUrl(), `/browser/session/${sessionId}/tabs`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, make_active: makeActive }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to create tab');
    }
    return safeJson(response);
  },

  activateTab: async (sessionId, tabId) => {
    const response = await fetch(joinUrl(requireBackendUrl(), `/browser/session/${sessionId}/tabs/${tabId}/activate`), {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to activate tab');
    }
    return safeJson(response);
  },

  closeTab: async (sessionId, tabId) => {
    const response = await fetch(joinUrl(requireBackendUrl(), `/browser/session/${sessionId}/tabs/${tabId}`), {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to close tab');
    }
    return safeJson(response);
  },

  // Click
  click: async (sessionId, x, y, button = 'left') => {
    const response = await fetch(joinUrl(requireBackendUrl(), `/browser/${sessionId}/click`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y, button }),
    });
    return safeJson(response);
  },

  // Type text
  type: async (sessionId, text) => {
    const response = await fetch(joinUrl(requireBackendUrl(), `/browser/${sessionId}/type`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return safeJson(response);
  },

  // Key press
  keypress: async (sessionId, key, modifiers = {}) => {
    const response = await fetch(joinUrl(requireBackendUrl(), `/browser/${sessionId}/keypress`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, modifiers }),
    });
    return safeJson(response);
  },

  // Scroll
  scroll: async (sessionId, deltaX, deltaY) => {
    const response = await fetch(joinUrl(requireBackendUrl(), `/browser/${sessionId}/scroll`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta_x: deltaX, delta_y: deltaY }),
    });
    return safeJson(response);
  },

  // Create WebSocket connection
  createWebSocket: (sessionId) => {
    // IMPORTANT:
    // - In local dev, REACT_APP_BACKEND_URL is typically '/api' (same-origin), so WS should connect to this same origin.
    // - In production (Vercel frontend + Render backend), REACT_APP_BACKEND_URL is an absolute URL like:
    //     https://xaax.onrender.com/api
    //   In that case, WS MUST connect to the backend host (NOT window.location.host).
    const wsBaseUrl = getWsUrl(); // e.g. 'wss://xaax.onrender.com/api' or 'ws://localhost:8001/api'
    return new WebSocket(`${wsBaseUrl}/browser/ws/${sessionId}`);
  },
};

// Extensions APIs
export const extensionsApi = {
  // List all extensions
  listExtensions: async () => {
    const response = await fetch(joinUrl(requireBackendUrl(), '/extensions'));
    if (!response.ok) {
      throw new Error('Failed to fetch extensions');
    }
    return safeJson(response);
  },

  // Load unpacked extension
  loadUnpacked: async (path) => {
    const response = await fetch(joinUrl(requireBackendUrl(), '/extensions/load'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to load extension');
    }
    return safeJson(response);
  },

  // Pack extension
  packExtension: async (path, keyPath = null) => {
    const response = await fetch(joinUrl(requireBackendUrl(), '/extensions/pack'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, key_path: keyPath }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to pack extension');
    }
    return safeJson(response);
  },

  // Toggle extension
  toggleExtension: async (extId, enabled) => {
    const response = await fetch(joinUrl(requireBackendUrl(), `/extensions/${extId}/toggle`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!response.ok) {
      throw new Error('Failed to toggle extension');
    }
    return safeJson(response);
  },

  // Remove extension
  removeExtension: async (extId) => {
    const response = await fetch(joinUrl(requireBackendUrl(), `/extensions/${extId}`), {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to remove extension');
    }
    return safeJson(response);
  },
};

// Search APIs
export const searchApi = {
  // Get AI-powered search suggestions
  getSuggestions: async (query, limit = 5) => {
    if (!query || query.length < 2) {
      return { suggestions: [], query };
    }
    
    const response = await fetch(
      joinUrl(requireBackendUrl(), `/search/suggestions?q=${encodeURIComponent(query)}&limit=${limit}`)
    );
    if (!response.ok) {
      return { suggestions: [], query };
    }
    return safeJson(response);
  },
};

export default { browserApi, extensionsApi, searchApi };
