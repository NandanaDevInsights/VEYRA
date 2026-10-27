const API_BASE = '/api';

/**
 * Universal API helper for communicating with the VEYRA MySQL backend
 */
export async function apiRequest(endpoint, method = 'GET', data = null) {
  const token = localStorage.getItem('veyra_token');
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };

  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, options);
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json.error || `Request failed with status ${res.status}`);
  }

  return json;
}

// Auth API
export const authApi = {
  login: (credentials) => apiRequest('/auth/login', 'POST', credentials),
  register: (data) => apiRequest('/auth/register', 'POST', data),
  me: () => apiRequest('/auth/me'),
  logout: () => apiRequest('/auth/logout', 'POST'),
};

// Admin API
export const adminApi = {
  getOverview: () => apiRequest('/admin/overview'),
  getUsers: () => apiRequest('/admin/users'),
  createUser: (data) => apiRequest('/admin/users', 'POST', data),
  updateUser: (id, data) => apiRequest(`/admin/users/${id}`, 'PUT', data),
  toggleUser: (id) => apiRequest(`/admin/users/${id}/toggle`, 'PATCH'),
  getRooms: () => apiRequest('/admin/rooms'),
  createRoom: (data) => apiRequest('/admin/rooms', 'POST', data),
  updateRoom: (no, data) => apiRequest(`/admin/rooms/${no}`, 'PUT', data),
  getRecords: () => apiRequest('/admin/records'),
  getPricing: () => apiRequest('/admin/pricing'),
  updatePricing: (data) => apiRequest('/admin/pricing', 'PUT', data),
  getActivity: (params = '') => apiRequest(`/admin/activity${params}`),
  getOperations: () => apiRequest('/admin/operations'),
  getLeaves: () => apiRequest('/admin/leaves'),
  updateLeave: (id, status) => apiRequest(`/admin/leaves/${id}`, 'PUT', { status }),
  sendAnnouncement: (data) => apiRequest('/admin/announcements', 'POST', data),
  getNotifications: () => apiRequest('/admin/notifications'),
};

// Front Desk API
export const frontdeskApi = {
  getOverview: () => apiRequest('/frontdesk/overview'),
  getRooms: () => apiRequest('/frontdesk/rooms'),
  updateRoomStatus: (id, status) => apiRequest(`/frontdesk/rooms/${id}/status`, 'PUT', { status }),
  getBookings: () => apiRequest('/frontdesk/bookings'),
  createBooking: (data) => apiRequest('/frontdesk/bookings', 'POST', data),
  checkin: (id) => apiRequest(`/frontdesk/checkin/${id}`, 'POST'),
  checkout: (id, data = {}) => apiRequest(`/frontdesk/checkout/${id}`, 'POST', data),
  postCharge: (id, data) => apiRequest(`/frontdesk/bookings/${id}/charges`, 'POST', data),
  postPayment: (id, data) => apiRequest(`/frontdesk/bookings/${id}/payments`, 'POST', data),
  getInHouse: () => apiRequest('/frontdesk/inhouse'),
  getServiceRequests: () => apiRequest('/frontdesk/service-requests'),
  createServiceRequest: (data) => apiRequest('/frontdesk/service-requests', 'POST', data),
  updateServiceRequest: (id, data) => apiRequest(`/frontdesk/service-requests/${id}`, 'PUT', data),
  deleteServiceRequest: (id) => apiRequest(`/frontdesk/service-requests/${id}`, 'DELETE'),
  getGuests: (q = '') => apiRequest(`/frontdesk/guests${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createGuest: (data) => apiRequest('/frontdesk/guests', 'POST', data),
  updateGuest: (id, data) => apiRequest(`/frontdesk/guests/${id}`, 'PUT', data),
  deleteGuest: (id) => apiRequest(`/frontdesk/guests/${id}`, 'DELETE'),
  getNotifications: () => apiRequest('/frontdesk/notifications'),
  markNotificationRead: (id) => apiRequest(`/frontdesk/notifications/${id}/read`, 'PATCH'),
  deleteNotification: (id) => apiRequest(`/frontdesk/notifications/${id}`, 'DELETE'),
  getShiftReport: () => apiRequest('/frontdesk/shift-report'),
  saveShiftReport: (data) => apiRequest('/frontdesk/shift-report', 'POST', data),
  search: (q) => apiRequest(`/frontdesk/search?q=${encodeURIComponent(q)}`),
  rateHousekeeper: (data) => apiRequest('/frontdesk/rate-housekeeper', 'POST', data),
};

// Housekeeping API
export const housekeepingApi = {
  getOverview: () => apiRequest('/housekeeping/overview'),
  getTasks: () => apiRequest('/housekeeping/tasks'),
  startTask: (id) => apiRequest(`/housekeeping/tasks/${id}/start`, 'POST'),
  completeTask: (id) => apiRequest(`/housekeeping/tasks/${id}/complete`, 'POST'),
  getRooms: () => apiRequest('/housekeeping/rooms'),
  requestMaintenance: (data) => apiRequest('/housekeeping/maintenance', 'POST', data),
  getServiceRequests: () => apiRequest('/housekeeping/service-requests'),
  updateServiceRequest: (id, status) => apiRequest(`/housekeeping/service-requests/${id}`, 'PUT', { status }),
  getComplaints: () => apiRequest('/housekeeping/complaints'),
  createComplaint: (data) => apiRequest('/housekeeping/complaints', 'POST', data),
  updateComplaint: (id, status) => apiRequest(`/housekeeping/complaints/${id}`, 'PUT', { status }),
  getSupplies: () => apiRequest('/housekeeping/supplies'),
  createSupply: (data) => apiRequest('/housekeeping/supplies', 'POST', data),
  updateSupply: (id, data) => apiRequest(`/housekeeping/supplies/${id}`, 'PUT', data),
  deleteSupply: (id) => apiRequest(`/housekeeping/supplies/${id}`, 'DELETE'),
  notifyRestock: (data) => apiRequest('/housekeeping/supplies/restock', 'POST', data),
  getAttendance: () => apiRequest('/housekeeping/attendance'),
  clockAttendance: () => apiRequest('/housekeeping/attendance/clock', 'POST'),
  getLeave: () => apiRequest('/housekeeping/leave'),
  applyLeave: (data) => apiRequest('/housekeeping/leave', 'POST', data),
  cancelLeave: (id) => apiRequest(`/housekeeping/leave/${id}`, 'DELETE'),
  toggleDuty: () => apiRequest('/housekeeping/duty', 'PATCH'),
  getRatings: () => apiRequest('/housekeeping/ratings'),
  getNotifications: () => apiRequest('/housekeeping/notifications'),
  markNotificationRead: (id, isRead = true) => apiRequest(`/housekeeping/notifications/${id}/read`, 'PATCH', { is_read: isRead ? 1 : 0 }),
  markAllNotificationsRead: () => apiRequest('/housekeeping/notifications/mark-all-read', 'POST'),
  deleteNotification: (id) => apiRequest(`/housekeeping/notifications/${id}`, 'DELETE'),
};

// Billing API
export const billingApi = {
  getOverview: () => apiRequest('/billing/overview'),
  getNextToBill: () => apiRequest('/billing/next-to-bill'),
  getInvoices: (status = '') => apiRequest(`/billing/invoices${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  getInvoice: (id) => apiRequest(`/billing/invoices/${id}`),
  createInvoice: (data) => apiRequest('/billing/invoices', 'POST', data),
  updateInvoice: (id, data) => apiRequest(`/billing/invoices/${id}`, 'PUT', data),
  voidInvoice: (id) => apiRequest(`/billing/invoices/${id}/void`, 'POST'),
  addPayment: (data) => apiRequest('/billing/payments', 'POST', data),
  getRefunds: () => apiRequest('/billing/refunds'),
  createRefund: (data) => apiRequest('/billing/refunds', 'POST', data),
  updateRefundStatus: (id, status) => apiRequest(`/billing/refunds/${id}/status`, 'PUT', { status }),
  getRevenue: () => apiRequest('/billing/revenue'),
  getGuests: () => apiRequest('/billing/guests'),
  getGuestAccount: (id) => apiRequest(`/billing/guests/${id}`),
  getActivity: () => apiRequest('/billing/activity'),
  getNotifications: () => apiRequest('/billing/notifications'),
  markNotificationRead: (id) => apiRequest(`/billing/notifications/${id}/read`, 'PATCH'),
  getSalaries: () => apiRequest('/billing/salaries'),
  createSalary: (data) => apiRequest('/billing/salaries', 'POST', data),
  updateSalary: (id, data) => apiRequest(`/billing/salaries/${id}`, 'PUT', data),
  disburseSalary: (id) => apiRequest(`/billing/salaries/${id}/disburse`, 'POST'),
};

export default {
  auth: authApi,
  admin: adminApi,
  frontdesk: frontdeskApi,
  housekeeping: housekeepingApi,
  billing: billingApi,
};
