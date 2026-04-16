/**
 * api.ts
 * Central API client for the E-Voting Platform backend.
 * All requests go through here — handles auth tokens automatically.
 */

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";

// ── Token Helpers ─────────────────────────────────────────────────

export const getAccessToken = (): string | null => localStorage.getItem("access_token");
// Kick off proactive refresh on page load
setTimeout(() => {
  const existing = localStorage.getItem('access_token');
  if (existing) scheduleProactiveRefresh(existing);
}, 500);

export const getRefreshToken = (): string | null => localStorage.getItem("refresh_token");

// Proactive background refresh — refresh access token 5 mins before expiry
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleProactiveRefresh(accessToken: string) {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  try {
    // Decode JWT payload to get expiry
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    const expiresIn = (payload.exp * 1000) - Date.now() - 5 * 60 * 1000; // 5 min before expiry
    if (expiresIn > 0) {
      _refreshTimer = setTimeout(async () => {
        const ok = await tryRefreshToken();
        if (ok) {
          const newToken = localStorage.getItem('access_token');
          if (newToken) scheduleProactiveRefresh(newToken);
        }
      }, expiresIn);
    }
  } catch { /* ignore decode errors */ }
}

export const saveTokens = (access: string, refresh: string) => {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
  scheduleProactiveRefresh(access);
};

export const clearTokens = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
};

export const saveUser = (user: object) => {
  localStorage.setItem("user", JSON.stringify(user));
};

export const getUser = () => {
  const user = localStorage.getItem("user");
  return user ? JSON.parse(user) : null;
};

// ── Core Fetch ────────────────────────────────────────────────────

export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
  requiresAuth = true
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (requiresAuth) {
    const token = getAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (err: any) {
    // Network failure — no connection, DNS failure, server unreachable
    if (!navigator.onLine) {
      throw new Error('You appear to be offline. Please check your internet connection and try again.');
    }
    throw new Error('Unable to reach the server. Please check your connection and try again.');
  }

  // If token expired, try refreshing
  if (response.status === 401 && requiresAuth) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry original request with new token
      headers["Authorization"] = `Bearer ${getAccessToken()}`;
      const retryResponse = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });
      return handleResponse(retryResponse);
    } else {
      // Clear tokens and redirect silently — no error toast
      clearTokens();
      const currentPath = window.location.pathname;
      const isVotingFlow = currentPath.includes('/events/') || currentPath.includes('/vote');
      const isAdminSection = currentPath.startsWith('/admin');
      const isOfficialSection = currentPath.startsWith('/official');
      if (!isVotingFlow) {
        if (isAdminSection || isOfficialSection) {
          // Silent redirect — no error shown
          window.location.replace(isOfficialSection ? '/official/login' : '/auth');
          return;
        }
        window.location.href = "/auth";
      }
      return;
    }
  }

  return handleResponse(response);
}

async function handleResponse(response: Response) {
  const text = await response.text();

  // Server returned HTML (Django error page, Nginx 502, etc.) — parse to friendly message
  if (text.startsWith('<!') || text.startsWith('<html')) {
    const statusMessages: Record<number, string> = {
      400: 'Invalid request. Please check your input and try again.',
      401: 'Your session has expired. Please sign in again.',
      403: 'You don\'t have permission to do that.',
      404: 'The requested resource was not found.',
      429: 'Too many requests. Please wait a moment before trying again.',
      500: 'The server encountered an error. Please try again shortly.',
      502: 'The server is temporarily unavailable. Please try again in a moment.',
      503: 'The service is temporarily down for maintenance. Please try again shortly.',
    };
    throw new Error(statusMessages[response.status] || `Server error (${response.status}). Please try again.`);
  }

  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Received an unexpected response from the server. Please try again.');
  }

  if (!response.ok) {
    // Extract the most human-readable error message available
    const raw = data?.error || data?.detail || data?.message || data?.non_field_errors?.[0];
    if (raw && typeof raw === 'string') {
      throw new Error(raw);
    }
    // Handle DRF field-level errors like { "email": ["Enter a valid email."] }
    if (typeof data === 'object') {
      const firstField = Object.values(data)[0];
      if (Array.isArray(firstField) && firstField.length > 0) {
        throw new Error(String(firstField[0]));
      }
    }
    throw new Error('Something went wrong. Please try again.');
  }

  return data;
}

async function tryRefreshToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  try {
    const response = await fetch(`${API_URL}/auth/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });

    if (response.ok) {
      const data = await response.json();
      saveTokens(data.access, refresh);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── AUTH API ──────────────────────────────────────────────────────

export const authApi = {
  /** Step 1: Request OTP */
  requestOTP: (channel: "email" | "sms", contact: string, purpose = "login") =>
    apiFetch("/auth/otp/request/", {
      method: "POST",
      body: JSON.stringify({
        channel,
        email: channel === "email" ? contact : undefined,
        phone: channel === "sms" ? contact : undefined,
        purpose,
      }),
    }, false),

  /** Step 2: Verify OTP → get JWT */
  verifyOTP: (channel: "email" | "sms", contact: string, code: string, name?: string) =>
    apiFetch("/auth/otp/verify/", {
      method: "POST",
      body: JSON.stringify({
        channel,
        email: channel === "email" ? contact : undefined,
        phone: channel === "sms" ? contact : undefined,
        code,
        name,
      }),
    }, false),

  /** Admin login with password */
  adminLogin: (email: string, password: string) =>
    apiFetch("/auth/admin/login/", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, false),

  /** Admin register */
  adminRegister: (data: {
    name: string;
    email: string;
    password: string;
    organization?: string;
    phone?: string;
  }) =>
    apiFetch("/auth/admin/register/", {
      method: "POST",
      body: JSON.stringify(data),
    }, false),

  /** Get current user profile */
  getProfile: () => apiFetch("/auth/profile/"),

  /** Update profile */
  updateProfile: (data: { name?: string; phone?: string; preferred_language?: string }) =>
    apiFetch("/auth/profile/", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  /** Logout */
  logout: () => {
    const refresh = getRefreshToken();
    return apiFetch("/auth/logout/", {
      method: "POST",
      body: JSON.stringify({ refresh }),
    });
  },
};

// ── EVENTS API ────────────────────────────────────────────────────

export const eventsApi = {
  /** List all public events */
  listEvents: (params?: { status?: string; event_type?: string; search?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiFetch(`/events/?${query}`, {}, false);
  },

  /** Get a single event by slug */
  getEvent: (slug: string) => apiFetch(`/events/${slug}/`, {}, false),

  /** Admin: list all their events */
  adminListEvents: () => apiFetch("/events/admin/"),

  /** Admin: create an event */
  adminCreateEvent: (data: object) =>
    apiFetch("/events/admin/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Admin: update an event */
  adminUpdateEvent: (slug: string, data: object) =>
    apiFetch(`/events/admin/${slug}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  /** Admin: delete an event */
  adminDeleteEvent: (slug: string) =>
    apiFetch(`/events/admin/${slug}/`, { method: "DELETE" }),

  /** Admin: change event status */
  adminChangeStatus: (slug: string, status: string) =>
    apiFetch(`/events/admin/${slug}/status/`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  /** Get categories for an event */
  getCategories: (slug: string) => apiFetch(`/events/${slug}/categories/`, {}, false),

  /** Admin: create a category */
  adminCreateCategory: (slug: string, data: object) =>
    apiFetch(`/events/${slug}/categories/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Get candidates for a category */
  getCandidates: (slug: string, catId: string) =>
    apiFetch(`/events/${slug}/categories/${catId}/candidates/`, {}, false),

  /** Admin: create a candidate */
  adminCreateCandidate: (slug: string, catId: string, data: object) =>
    apiFetch(`/events/${slug}/categories/${catId}/candidates/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ── VOTING API ────────────────────────────────────────────────────

export const votingApi = {
  /** Cast a vote */
  castVote: (data: {
    event_slug: string;
    category_id: string;
    candidate_ids: string[];
    payment_ref?: string;
    quantity?: number;
  }) => {
    return apiFetch("/voting/cast/", {
      method: "POST",
      body: JSON.stringify(data),
    }, true);  // always send auth token if available
  },

  /** Get live results for an event */
  getLiveResults: (slug: string) =>
    apiFetch(`/voting/results/${slug}/`, {}, false),

  /** Admin: get voter activity */
  getVoterActivity: (slug: string) =>
    apiFetch(`/voting/admin/${slug}/voters/`),

  /** Admin: get fraud flags */
  getFraudFlags: (slug: string) =>
    apiFetch(`/voting/admin/${slug}/fraud/`),
};

// ── PAYMENTS API ──────────────────────────────────────────────────

export const paymentsApi = {
  /** Initialize a payment */
  initializePayment: (data: {
    event_slug: string;
    votes_count: number;
    email: string;
    callback_url?: string;
  }) =>
    apiFetch("/payments/initialize/", {
      method: "POST",
      body: JSON.stringify(data),
    }, false),

  /** Verify a payment */
  verifyPayment: (reference: string) =>
    apiFetch(`/payments/verify/${reference}/`, {}, false),

  /** Get payment history */
  getPaymentHistory: () => apiFetch("/payments/history/"),
};

// ── ANALYTICS API ─────────────────────────────────────────────────

export const analyticsApi = {
  /** Get admin dashboard stats */
  getDashboard: () => apiFetch("/analytics/dashboard/"),

  /** Get event-specific analytics */
  getEventAnalytics: (slug: string) => apiFetch(`/analytics/${slug}/`),
};

// ── NOTIFICATIONS API ─────────────────────────────────────────────

export const notificationsApi = {
  /** Publish results and notify voters */
  publishResults: (slug: string) =>
    apiFetch(`/notifications/publish-results/${slug}/`, { method: "POST" }),

  /** Send reminder to all voters */
  sendReminder: (slug: string) =>
    apiFetch(`/notifications/remind/${slug}/`, { method: "POST" }),
};

// ── WEBSOCKET ─────────────────────────────────────────────────────

const WS_URL = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000";

export const connectToLiveResults = (
  slug: string,
  onMessage: (data: any) => void,
  onError?: () => void
): WebSocket => {
  const ws = new WebSocket(`${WS_URL}/ws/results/${slug}/`);

  ws.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      onMessage(parsed);
    } catch {
      console.error("WebSocket parse error");
    }
  };

  ws.onerror = () => {
    console.error("WebSocket error");
    onError?.();
  };

  // Keep alive with ping
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    }
  }, 30000);

  ws.onclose = () => clearInterval(pingInterval);

  return ws;
};
// ── OFFICIALS API ──────────────────────────────────────────────────

export const officialsApi = {
  /** Step 1: Request OTP to phone */
  requestOtp: (phone: string) =>
    apiFetch("/officials/auth/request-otp/", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }, false),

  /** Step 2: Verify OTP, receive JWT + profile */
  verifyOtp: (phone: string, code: string) =>
    apiFetch("/officials/auth/verify-otp/", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    }, false),

  /** Get full dashboard data */
  getDashboard: () => apiFetch("/officials/dashboard/"),

  /** Ticket official: list tickets */
  getTickets: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch(`/officials/tickets/${qs}`);
  },

  /** Ticket official: check in a ticket */
  checkIn: (ticket_code: string) =>
    apiFetch("/officials/check-in/", {
      method: "POST",
      body: JSON.stringify({ ticket_code }),
    }),

  /** Election official: voter roll */
  getVoterRoll: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch(`/officials/voter-roll/${qs}`);
  },

  /** Election official: add single voter */
  addVoter: (data: Record<string, any>) =>
    apiFetch("/officials/voter-roll/add/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Election official: upload CSV */
  uploadVoterCSV: (file: File, sendSms = false) => {
    const form = new FormData();
    form.append("file", file);
    form.append("send_sms", String(sendSms));
    const token = localStorage.getItem("access_token");
    return fetch(`${API_URL}/officials/voter-roll/upload/`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then((r) => r.json());
  },

  /** Official: list own withdrawal requests */
  getWithdrawals: () => apiFetch("/officials/withdrawals/"),

  /** Official: create withdrawal request */
  requestWithdrawal: (amount: number, note?: string, paymentMethod?: string, paymentAccountName?: string, paymentAccountNumber?: string) =>
    apiFetch("/officials/withdrawals/", {
      method: "POST",
      body: JSON.stringify({ amount, note, payment_method: paymentMethod, payment_account_name: paymentAccountName, payment_account_number: paymentAccountNumber }),
    }),

  // ── Admin ────────────────────────────────────────────────────────

  /** Admin: list officials, optionally filtered by event */
  adminList: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch(`/officials/admin/${qs}`);
  },

  /** Admin: create official */
  adminCreate: (data: Record<string, any>) =>
    apiFetch("/officials/admin/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Admin: update official */
  adminUpdate: (id: string, data: Record<string, any>) =>
    apiFetch(`/officials/admin/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  /** Admin: delete official */
  adminDelete: (id: string) =>
    apiFetch(`/officials/admin/${id}/`, { method: "DELETE" }),

  /** Admin: list withdrawal requests */
  adminWithdrawals: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch(`/officials/admin/withdrawals/${qs}`);
  },

  /** Admin: approve or decline a withdrawal */
  adminReviewWithdrawal: (id: string, action: "approve" | "decline", admin_note?: string) =>
    apiFetch(`/officials/admin/withdrawals/${id}/review/`, {
      method: "PATCH",
      body: JSON.stringify({ action, admin_note }),
    }),
};

// ── BULK VOTE (org elections) ──────────────────────────────────────

export const castBulkVote = (
  event_slug: string,
  votes: Array<{ category_id: string; candidate_id: string }>
) =>
  apiFetch("/voting/cast-bulk/", {
    method: "POST",
    body: JSON.stringify({ event_slug, votes }),
  });