/**
 * Centralized API Service for React Application
 */

const API_BASE = '';

async function request(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  let data;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = { message: 'Invalid response format received from server.' };
    }
  } else {
    const text = await response.text();
    data = { message: text || `Server Error (${response.status})` };
  }

  if (!response.ok) {
    throw new Error(data.detail || data.message || `Request failed (${response.status})`);
  }
  return data;
}

export const api = {
  // Authentication
  requestOtp: (phone) => request('/api/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyOtp: (phone, code) => request('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  register: (payload) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  getMe: (token) => request('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } }),

  // Desks
  getDesks: () => request('/api/desks'),
  getDesk: (id) => request(`/api/desks/${id}`),

  // Lost Items
  createLostItem: (payload) => request('/api/lost-items', { method: 'POST', body: JSON.stringify(payload) }),
  getLostItem: (id) => request(`/api/lost-items/${id}`),

  // Found Items
  createDeskFoundItem: (payload) => request('/api/found-items/desk', { method: 'POST', body: JSON.stringify(payload) }),
  createDirectFoundItem: (payload) => request('/api/found-items/direct', { method: 'POST', body: JSON.stringify(payload) }),

  // Status & Tracking
  lookupStatus: (phoneOrToken) => request('/api/user-status/lookup', {
    method: 'POST',
    body: JSON.stringify({ phone_or_token: phoneOrToken })
  }),

  // Notifications
  getNotifications: (userIdentifier) => request(`/api/notifications/${encodeURIComponent(userIdentifier)}`),
  markNotificationRead: (notifId) => request(`/api/notifications/${encodeURIComponent(notifId)}/read`, { method: 'POST' }),

  // User Financial & Overview Metrics
  getUserMetrics: (userIdentifier) => request(`/api/users/${encodeURIComponent(userIdentifier)}/metrics`),

  // Matching Engine
  evaluateMatches: (lostItemId, pin = 'admin123') => request(`/api/matching/evaluate/${lostItemId}`, {
    method: 'POST',
    headers: { 'x-admin-pin': pin }
  }),
  evaluateFoundMatches: (foundItemId, pin = 'admin123') => request(`/api/matching/evaluate-found/${foundItemId}`, {
    method: 'POST',
    headers: { 'x-admin-pin': pin }
  }),
  getMatchResults: (lostItemId, pin = 'admin123') => request(`/api/matching/results/${lostItemId}`, {
    headers: { 'x-admin-pin': pin }
  }),
  generatePasscode: (evalId, pin = 'admin123') => request(`/api/matching/matches/${evalId}/generate-passcode`, {
    method: 'POST',
    headers: { 'x-admin-pin': pin }
  }),
  createProbe: (lostItemId, foundItemId, secretIndex = 0, pin = 'admin123') => request('/api/matching/create-probe', {
    method: 'POST',
    headers: { 'x-admin-pin': pin },
    body: JSON.stringify({ lost_item_id: lostItemId, found_item_id: foundItemId, secret_point_index: secretIndex })
  }),
  submitProbeResponse: (probeId, photoData, notes = '') => request(`/api/matching/probes/${probeId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ photo_data: photoData, finder_notes: notes })
  }),
  verifyHandoverPasscode: (passcode, deskId = 'DESK-LIB-02', officerName = 'Duty Officer', pin = 'admin123') => request('/api/matching/handover/verify-passcode', {
    method: 'POST',
    headers: { 'x-admin-pin': pin },
    body: JSON.stringify({ passcode, desk_id: deskId, officer_name: officerName })
  }),

  // Admin Portal
  adminLogin: (pin) => request('/api/admin/login', { method: 'POST', body: JSON.stringify({ pin }) }),
  getAdminLostItems: (pin) => request('/api/admin/lost-items', { headers: { 'x-admin-pin': pin } }),
  getAdminFoundItems: (pin) => request('/api/admin/found-items', { headers: { 'x-admin-pin': pin } }),
  getAdminEscrowRecords: (pin) => request('/api/admin/escrow-records', { headers: { 'x-admin-pin': pin } }),
  getArchivedItems: (pin) => request('/api/admin/archived-items', { headers: { 'x-admin-pin': pin } }),
  getPendingApprovals: (pin = 'admin123') => request('/api/admin/pending-approvals', { headers: { 'x-admin-pin': pin } }),
  decideApproval: (evalId, decision, notes = '', pin = 'admin123') => request(`/api/admin/approvals/${evalId}/decide`, {
    method: 'POST',
    headers: { 'x-admin-pin': pin },
    body: JSON.stringify({ decision, notes })
  }),
  seedDemo: (pin = 'admin123') => request('/api/admin/seed-demo', { method: 'POST', headers: { 'x-admin-pin': pin } })
};
