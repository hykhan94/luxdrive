// ============================================
// apps/web/lib/api.ts
// Direct calls to backend — no Next.js rewrites
// Cookies work on localhost across ports (same-site)
// ============================================

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface ApiOptions extends RequestInit {
  params?: Record<string, string | number | undefined>;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

async function apiFetch<T = any>(
  endpoint: string,
  options: ApiOptions = {},
): Promise<ApiResponse<T>> {
  const { params, headers: customHeaders, ...rest } = options;

  let url = `${API_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        searchParams.set(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) url += `?${queryString}`;
  }

  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...customHeaders,
    },
    ...rest,
  });

  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    if (!response.ok) {
      throw new ApiError(response.status, "Server error");
    }
    return { success: true } as ApiResponse<T>;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.message || data.error || "Request failed",
      data,
    );
  }

  return data;
}

export class ApiError extends Error {
  status: number;
  data?: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

// ============== CONVENIENCE METHODS ==============

export const api = {
  get: <T = any>(
    endpoint: string,
    params?: Record<string, string | number | undefined>,
  ) => apiFetch<T>(endpoint, { method: "GET", params }),

  post: <T = any>(endpoint: string, body?: any) =>
    apiFetch<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = any>(endpoint: string, body?: any) =>
    apiFetch<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T = any>(endpoint: string, body?: any) =>
    apiFetch<T>(endpoint, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = any>(endpoint: string) =>
    apiFetch<T>(endpoint, { method: "DELETE" }),
};

// ============== AUTH API ==============

export const authApi = {
  signIn: async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.message || data.error || "Invalid email or password",
      );
    }

    return data;
  },

  signUp: async (userData: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    dob?: string;
  }) => {
    const response = await fetch(`${API_URL}/api/auth/sign-up/email`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: userData.email,
        password: userData.password,
        name: userData.name,
        phone: userData.phone,
        dob: userData.dob,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.message || data.error || "Registration failed",
      );
    }

    return data;
  },

  getSession: async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/get-session`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data;
    } catch {
      // Backend not running — silently return null, no error spam
      return null;
    }
  },

  // Resolves the right avatar URL for the signed-in user based on
  // role: user.image for customer/admin/sales/ops/finance,
  // vendor.logoUrl for vendors, partner.logoUrl for partners. The
  // backend signs the URL before returning so it's directly loadable
  // by an <img> tag. Returns null when the user has no image set.
  getMyAvatar: async (): Promise<string | null> => {
    try {
      const response = await fetch(`${API_URL}/api/v1/me/avatar`, {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data?.data?.avatarUrl ?? null;
    } catch {
      return null;
    }
  },

  signOut: async () => {
    try {
      await fetch(`${API_URL}/api/auth/sign-out`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore
    }
  },

  // Trigger a password-reset email. Better Auth's endpoint takes
  // `email` + `redirectTo` and replies with a generic success
  // regardless of whether the email exists (deliberate, to prevent
  // account enumeration). The actual email delivery happens inside
  // server/src/lib/auth.ts via the sendResetPassword hook → Resend.
  //
  // Endpoint name note: Better Auth 1.4 renamed this from
  // /forget-password to /request-password-reset (along with the
  // matching client method authClient.forgotPassword →
  // authClient.requestPasswordReset). Servers on 1.4+ — including
  // our 1.6.9 — only expose the new path. Hitting the old
  // /forget-password returns a 404 from Better Auth's internal
  // router even though the handler is reached. See:
  // https://better-auth.com/blog/1-4
  //
  // redirectTo is where Better Auth will send the user when they
  // click the email link — it appends ?token=<reset-token> for the
  // /reset-password page to consume. Using window.location.origin
  // means dev (localhost), staging, and production each get their
  // own reset URL without env-coupled config.
  forgetPassword: async (email: string) => {
    const response = await fetch(`${API_URL}/api/auth/request-password-reset`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.message || data.error || "Could not send reset email",
      );
    }
    return data;
  },

  // Complete a password reset using the token from the email link.
  // The Better Auth endpoint expects `newPassword` (not `password`)
  // and `token` — calling with the wrong field name returns 400 with
  // a non-obvious error, so the wrapper here pins the naming.
  resetPassword: async (newPassword: string, token: string) => {
    const response = await fetch(`${API_URL}/api/auth/reset-password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword, token }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.message || data.error || "Could not reset password",
      );
    }
    return data;
  },
};

// ============== ADMIN API ==============

const ADMIN_BASE = "/api/v1/admin";

export const adminApi = {
  getSidebarBadges: () => api.get(`${ADMIN_BASE}/sidebar-badges`),
  getDashboard: () => api.get(`${ADMIN_BASE}/dashboard`),
  getBookings: (params?: Record<string, any>) =>
    api.get(`${ADMIN_BASE}/bookings`, params),
  getBooking: (id: string) => api.get(`${ADMIN_BASE}/bookings/${id}`),

  // Vendor Management
  getVendorSummary: () => api.get(`${ADMIN_BASE}/vendors/summary`),
  getVendorNotifications: () => api.get(`${ADMIN_BASE}/vendors/notifications`),
  getVendorsWithPendingFleetReviews: () =>
    api.get(`${ADMIN_BASE}/vendors/pending-fleet-reviews`),
  getVendors: (params?: Record<string, any>) =>
    api.get(`${ADMIN_BASE}/vendors`, params),
  getVendor: (id: string) => api.get(`${ADMIN_BASE}/vendors/${id}`),
  onboardVendor: (body: { companyName: string; email: string }) =>
    api.post(`${ADMIN_BASE}/vendors/onboard`, body),
  resendVendorInvitation: (id: string) =>
    api.post(`${ADMIN_BASE}/vendors/${id}/resend-invitation`, {}),
  suspendVendor: (id: string, body: { reason: string }) =>
    api.patch(`${ADMIN_BASE}/vendors/${id}/suspend`, body),
  reactivateVendor: (id: string) =>
    api.patch(`${ADMIN_BASE}/vendors/${id}/reactivate`, {}),

  // Vendor Profile Reviews
  getVendorPendingReviews: () =>
    api.get(`${ADMIN_BASE}/vendors/reviews/pending`),
  getVendorProfileForReview: (id: string) =>
    api.get(`${ADMIN_BASE}/vendors/${id}/review`),
  addVendorReviewComment: (
    id: string,
    body: { fieldName: string; comment: string },
  ) => api.post(`${ADMIN_BASE}/vendors/${id}/review/comment`, body),
  resolveVendorReviewComment: (id: string, commentId: string) =>
    api.patch(
      `${ADMIN_BASE}/vendors/${id}/review/comment/${commentId}/resolve`,
      {},
    ),
  approveVendor: (id: string) =>
    api.patch(`${ADMIN_BASE}/vendors/${id}/approve`, {}),
  requestVendorChanges: (id: string) =>
    api.patch(`${ADMIN_BASE}/vendors/${id}/request-changes`, {}),

  // Vendor Bank Update Requests
  getBankUpdateRequests: (params?: Record<string, any>) =>
    api.get(`${ADMIN_BASE}/vendors/bank-requests`, params),
  approveBankUpdateRequest: (requestId: string) =>
    api.patch(`${ADMIN_BASE}/vendors/bank-requests/${requestId}/approve`, {}),
  rejectBankUpdateRequest: (requestId: string, body: { adminNote: string }) =>
    api.patch(`${ADMIN_BASE}/vendors/bank-requests/${requestId}/reject`, body),

  // Vendor's Drivers (admin scope)
  getVendorDrivers: (vendorId: string, params?: Record<string, any>) =>
    api.get(`${ADMIN_BASE}/vendors/${vendorId}/drivers`, params),
  getVendorDriverDetail: (vendorId: string, driverId: string) =>
    api.get(`${ADMIN_BASE}/vendors/${vendorId}/drivers/${driverId}`),
  approveVendorDriver: (vendorId: string, driverId: string) =>
    api.patch(
      `${ADMIN_BASE}/vendors/${vendorId}/drivers/${driverId}/approve`,
      {},
    ),
  requestDriverChanges: (
    vendorId: string,
    driverId: string,
    body: { fields: string[]; message: string },
  ) =>
    api.patch(
      `${ADMIN_BASE}/vendors/${vendorId}/drivers/${driverId}/request-changes`,
      body,
    ),
  addDriverReviewComment: (
    vendorId: string,
    driverId: string,
    body: { fieldName: string; comment: string },
  ) =>
    api.post(
      `${ADMIN_BASE}/vendors/${vendorId}/drivers/${driverId}/review/comment`,
      body,
    ),
  resolveDriverReviewComment: (
    vendorId: string,
    driverId: string,
    commentId: string,
  ) =>
    api.patch(
      `${ADMIN_BASE}/vendors/${vendorId}/drivers/${driverId}/review/comment/${commentId}/resolve`,
      {},
    ),

  // Vendor's Vehicles (admin scope)
  getVendorVehicles: (vendorId: string, params?: Record<string, any>) =>
    api.get(`${ADMIN_BASE}/vendors/${vendorId}/vehicles`, params),
  getVendorVehicleDetail: (vendorId: string, vehicleId: string) =>
    api.get(`${ADMIN_BASE}/vendors/${vendorId}/vehicles/${vehicleId}`),
  approveVendorVehicle: (vendorId: string, vehicleId: string) =>
    api.patch(
      `${ADMIN_BASE}/vendors/${vendorId}/vehicles/${vehicleId}/approve`,
      {},
    ),
  requestVehicleChanges: (
    vendorId: string,
    vehicleId: string,
    body: { documents: string[]; message: string },
  ) =>
    api.patch(
      `${ADMIN_BASE}/vendors/${vendorId}/vehicles/${vehicleId}/request-changes`,
      body,
    ),
  addVehicleReviewComment: (
    vendorId: string,
    vehicleId: string,
    body: { fieldName: string; comment: string },
  ) =>
    api.post(
      `${ADMIN_BASE}/vendors/${vendorId}/vehicles/${vehicleId}/review/comment`,
      body,
    ),
  resolveVehicleReviewComment: (
    vendorId: string,
    vehicleId: string,
    commentId: string,
  ) =>
    api.patch(
      `${ADMIN_BASE}/vendors/${vendorId}/vehicles/${vehicleId}/review/comment/${commentId}/resolve`,
      {},
    ),

  // Driver Change Requests (vendor-initiated)
  getDriverChangeRequests: () =>
    api.get(`${ADMIN_BASE}/driver-change-requests`),
  approveDriverChangeRequest: (id: string, body?: { adminNote?: string }) =>
    api.patch(`${ADMIN_BASE}/driver-change-requests/${id}/approve`, body),
  rejectDriverChangeRequest: (id: string, body: { adminNote: string }) =>
    api.patch(`${ADMIN_BASE}/driver-change-requests/${id}/reject`, body),

  // Vehicle Change Requests (vendor-initiated)
  getVehicleChangeRequests: () =>
    api.get(`${ADMIN_BASE}/vehicle-change-requests`),
  approveVehicleChangeRequest: (id: string, body?: { adminNote?: string }) =>
    api.patch(`${ADMIN_BASE}/vehicle-change-requests/${id}/approve`, body),
  rejectVehicleChangeRequest: (id: string, body: { adminNote: string }) =>
    api.patch(`${ADMIN_BASE}/vehicle-change-requests/${id}/reject`, body),

  // Vendor Profile Change Requests (vendor-initiated — approved vendor asks
  // admin for permission to edit profile fields/docs)
  getVendorProfileChangeRequests: () =>
    api.get(`${ADMIN_BASE}/vendor-profile-change-requests`),
  approveVendorProfileChangeRequest: (
    id: string,
    body?: { adminNote?: string },
  ) =>
    api.patch(
      `${ADMIN_BASE}/vendor-profile-change-requests/${id}/approve`,
      body,
    ),
  rejectVendorProfileChangeRequest: (id: string, body: { adminNote: string }) =>
    api.patch(
      `${ADMIN_BASE}/vendor-profile-change-requests/${id}/reject`,
      body,
    ),

  // Partners
  getPartnerSummary: () => api.get(`${ADMIN_BASE}/partners/summary`),
  getPartners: (params?: Record<string, any>) =>
    api.get(`${ADMIN_BASE}/partners`, params),
  getPartner: (id: string) => api.get(`${ADMIN_BASE}/partners/${id}`),

  // Payments / Users
  getPaymentSummary: () => api.get(`${ADMIN_BASE}/payments/summary`),
  getUserSummary: () => api.get(`${ADMIN_BASE}/users/summary`),
  getUsers: (params?: Record<string, any>) =>
    api.get(`${ADMIN_BASE}/users`, params),
  getUser: (id: string) => api.get(`${ADMIN_BASE}/users/${id}`),

  // Alerts / Loyalty / WhatsApp / Role Manager
  getAlertsSummary: () =>
    api.get(`${ADMIN_BASE}/alerts-settings/unactioned-bookings/summary`),
  getLoyaltyConfig: () => api.get(`${ADMIN_BASE}/alerts-settings/loyalty`),
  getWhatsAppTemplate: () => api.get(`${ADMIN_BASE}/alerts-settings/whatsapp`),
  getRoleManagerDashboard: () =>
    api.get(`${ADMIN_BASE}/role-manager/dashboard`),
  getAuditLogs: (params?: Record<string, any>) =>
    api.get(`${ADMIN_BASE}/role-manager/audit-logs`, params),

  // Partner Change Requests
  getPartnerChangeRequests: () =>
    api.get(`${ADMIN_BASE}/partner-change-requests`),
  approvePartnerChangeRequest: (id: string, body?: { adminNote?: string }) =>
    api.patch(`${ADMIN_BASE}/partner-change-requests/${id}/approve`, body),
  rejectPartnerChangeRequest: (id: string, body: { adminNote: string }) =>
    api.patch(`${ADMIN_BASE}/partner-change-requests/${id}/reject`, body),

  // ============== Bookings (Stage 3B) ==============
  // Note: getBookings + getBooking already declared above. The rest of
  // the booking surface follows here so all booking actions are in one
  // place. assignVendor and reOfferBooking are the new Stage 3B offer-
  // flow entry points; assignVendor now requires payoutAmount.
  getBookingStats: () => api.get(`${ADMIN_BASE}/bookings/stats`),
  markBookingsAsRead: (body: { bookingIds: string[] }) =>
    api.post(`${ADMIN_BASE}/bookings/mark-read`, body),
  markAllBookingsAsRead: () =>
    api.post(`${ADMIN_BASE}/bookings/mark-all-read`, {}),
  resolveBookingAttention: (id: string) =>
    api.patch(`${ADMIN_BASE}/bookings/${id}/resolve-attention`, {}),
  getAvailableVendors: (bookingId: string) =>
    api.get(`${ADMIN_BASE}/bookings/${bookingId}/available-vendors`),
  assignVendor: (
    id: string,
    body: {
      vendorId: string;
      payoutAmount: number;
      vehicleId?: string;
      driverId?: string;
    },
  ) => api.patch(`${ADMIN_BASE}/bookings/${id}/assign-vendor`, body),
  // Re-offer at revised price — only valid when booking is in
  // ASSIGNMENT_RE_OFFERED state after a PRICE_TOO_LOW rejection at
  // attempt 1.
  reOfferBooking: (id: string, body: { payoutAmount: number }) =>
    api.post(`${ADMIN_BASE}/bookings/${id}/re-offer`, body),
  // Admin records a vendor rejection on their behalf (e.g. vendor
  // called instead of using the app). `reason` accepts the
  // OfferRejectionReason enum value.
  recordVendorRejection: (
    id: string,
    body: {
      vendorId: string;
      reason: "CAR_DRIVER_UNAVAILABLE" | "PRICE_TOO_LOW" | "UNSUITABLE_ROUTE";
    },
  ) => api.post(`${ADMIN_BASE}/bookings/${id}/vendor-rejection`, body),
  cancelBooking: (id: string, body: { reason?: string }) =>
    api.patch(`${ADMIN_BASE}/bookings/${id}/cancel`, body),
  updateBookingStatus: (id: string, body: { status: string; notes?: string }) =>
    api.patch(`${ADMIN_BASE}/bookings/${id}/status`, body),

  // ============== Payments (Stage 3B) ==============
  // Vendor side = payouts admin owes vendor ("Payments to Send").
  // Partner side = invoices partner owes admin ("Payments to Receive").
  // Route paths keep the legacy `vendor-receipts` prefix for backward
  // compat; semantics are payout-direction under Stage 3B.
  //
  // Note: reviewVendorReceipt is intentionally NOT exposed here. That
  // endpoint returns 410 under the new direction — there's no separate
  // review step for vendor payouts; admin uploads receipt and marks
  // PAID in a single action via markVendorReceiptPaid.
  getOnlinePayments: (params?: Record<string, any>) =>
    api.get(`${ADMIN_BASE}/payments/online`, params),
  getVendorReceipts: (params?: Record<string, any>) =>
    api.get(`${ADMIN_BASE}/payments/vendor-receipts`, params),
  getVendorReceiptDetails: (id: string) =>
    api.get(`${ADMIN_BASE}/payments/vendor-receipts/${id}`),
  // Single-step terminal action: admin paid the vendor and uploads the
  // bank-transfer receipt. body.receiptUrl + body.receiptFileName are
  // the GCS path + display name of the uploaded receipt.
  markVendorReceiptPaid: (
    id: string,
    body: { receiptUrl: string; receiptFileName?: string },
  ) =>
    api.patch(`${ADMIN_BASE}/payments/vendor-receipts/${id}/mark-paid`, body),
  generateVendorReceipt: (body: {
    vendorId: string;
    periodStart: string;
    periodEnd: string;
    generationType?: string;
  }) => api.post(`${ADMIN_BASE}/payments/vendor-receipts/generate`, body),
  runVendorMonthlyReceipts: (body?: { targetMonth?: string }) =>
    api.post(`${ADMIN_BASE}/payments/vendor-receipts/run-monthly`, body),
  getPartnerInvoices: (params?: Record<string, any>) =>
    api.get(`${ADMIN_BASE}/payments/partner-invoices`, params),
  getPartnerInvoiceDetails: (id: string) =>
    api.get(`${ADMIN_BASE}/payments/partner-invoices/${id}`),
  sendPartnerReminder: (id: string) =>
    api.post(`${ADMIN_BASE}/payments/partner-invoices/${id}/send-reminder`, {}),
  confirmPartnerPayment: (id: string) =>
    api.patch(`${ADMIN_BASE}/payments/partner-invoices/${id}/confirm`, {}),
  markPartnerPaymentReceived: (id: string) =>
    api.patch(
      `${ADMIN_BASE}/payments/partner-invoices/${id}/mark-received`,
      {},
    ),
  generatePartnerInvoice: (body: {
    partnerId: string;
    periodStart: string;
    periodEnd: string;
    generationType?: string;
  }) => api.post(`${ADMIN_BASE}/payments/partner-invoices/generate`, body),
  // Manual unsuspend after auto-suspension. Audit-logs unpaid invoice
  // IDs at unsuspend time per spec. Allowed even with unpaid invoices.
  manualUnsuspendPartner: (id: string, body?: { reason?: string }) =>
    api.post(`${ADMIN_BASE}/payments/partners/${id}/unsuspend`, body || {}),

  // ============== Partner Management (panel surface) ==============
  // Existing summary/list/detail helpers already declared above. The
  // CRUD-ish actions below are migrated from the panel's previous
  // hardcoded paths so all partner-management calls go through one
  // helper namespace.
  invitePartner: (body: { companyName: string; email: string }) =>
    api.post(`${ADMIN_BASE}/partners/invite`, body),
  resendPartnerInvitation: (id: string) =>
    api.post(`${ADMIN_BASE}/partners/${id}/resend-invitation`, {}),
  getPendingPartnerReviews: () =>
    api.get(`${ADMIN_BASE}/partners/reviews/pending`),
  getPartnerForReview: (id: string) =>
    api.get(`${ADMIN_BASE}/partners/${id}/review`),
  addPartnerReviewComment: (
    id: string,
    body: { fieldName: string; comment: string },
  ) => api.post(`${ADMIN_BASE}/partners/${id}/review/comment`, body),
  resolvePartnerReviewComment: (id: string, commentId: string) =>
    api.patch(
      `${ADMIN_BASE}/partners/${id}/review/comment/${commentId}/resolve`,
      {},
    ),
  approvePartner: (id: string) =>
    api.patch(`${ADMIN_BASE}/partners/${id}/approve`, {}),
  requestPartnerChanges: (id: string) =>
    api.patch(`${ADMIN_BASE}/partners/${id}/request-changes`, {}),
  suspendPartner: (id: string, body: { reason: string }) =>
    api.patch(`${ADMIN_BASE}/partners/${id}/suspend`, body),
  // General-purpose partner reactivation (use when manually un-suspending
  // a partner whose suspension wasn't payment-driven). For payment-
  // auto-suspended partners use manualUnsuspendPartner above — that
  // path writes the unpaid-invoice audit trail per Stage 3B-2 spec.
  reactivatePartner: (id: string) =>
    api.patch(`${ADMIN_BASE}/partners/${id}/reactivate`, {}),
};

// ============== PARTNER API ==============

const PARTNER_BASE = "/api/v1/partner";

export const partnerApi = {
  // Sidebar badges
  getSidebarBadges: () => api.get(`${PARTNER_BASE}/sidebar-badges`),

  // Dashboard
  getProfileStatus: () => api.get(`${PARTNER_BASE}/dashboard/profile-status`),
  getDashboardSummary: () => api.get(`${PARTNER_BASE}/dashboard/summary`),
  getDashboardBookings: (params?: Record<string, any>) =>
    api.get(`${PARTNER_BASE}/dashboard/bookings`, params),
  getCalendarData: (params?: Record<string, any>) =>
    api.get(`${PARTNER_BASE}/dashboard/calendar`, params),
  getContractStats: () => api.get(`${PARTNER_BASE}/dashboard/contract-stats`),

  // Book a Ride
  getAvailableRoutes: (params: Record<string, any>) =>
    api.get(`${PARTNER_BASE}/book-ride/routes`, params),
  getVehicleOptions: (params: Record<string, any>) =>
    api.get(`${PARTNER_BASE}/book-ride/vehicle-options`, params),
  getPriceBreakdown: (body: any) =>
    api.post(`${PARTNER_BASE}/book-ride/price-breakdown`, body),
  createBooking: (body: any) => api.post(`${PARTNER_BASE}/book-ride`, body),
  getBookRideDetail: (id: string) => api.get(`${PARTNER_BASE}/book-ride/${id}`),
  cancelBooking: (id: string, body?: any) =>
    api.patch(`${PARTNER_BASE}/book-ride/${id}/cancel`, body),

  // Bookings Repository
  getBookings: (params?: Record<string, any>) =>
    api.get(`${PARTNER_BASE}/bookings`, params),
  exportBookingsCsv: (params?: Record<string, any>) =>
    api.get(`${PARTNER_BASE}/bookings/export`, params),
  getBookingDetail: (id: string) => api.get(`${PARTNER_BASE}/bookings/${id}`),
  getBookingPO: (id: string) => api.get(`${PARTNER_BASE}/bookings/${id}/po`),

  // Tariffs
  getTariffOverview: () => api.get(`${PARTNER_BASE}/tariffs`),
  getCityTariffs: (city: string) => api.get(`${PARTNER_BASE}/tariffs/${city}`),
  getCityRouteTypeTariffs: (city: string, routeType: string) =>
    api.get(`${PARTNER_BASE}/tariffs/${city}/${routeType}`),

  // Invoices
  getMonthlyInvoices: (params?: Record<string, any>) =>
    api.get(`${PARTNER_BASE}/invoices/monthly`, params),
  getCustomInvoices: (params?: Record<string, any>) =>
    api.get(`${PARTNER_BASE}/invoices/custom`, params),
  generateCustomInvoice: (body: { startDate: string; endDate: string }) =>
    api.post(`${PARTNER_BASE}/invoices/custom`, body),
  getInvoiceDetail: (id: string) => api.get(`${PARTNER_BASE}/invoices/${id}`),
  exportInvoiceCsv: (id: string) =>
    api.get(`${PARTNER_BASE}/invoices/${id}/csv`),
  downloadInvoicePdf: (id: string) =>
    api.get(`${PARTNER_BASE}/invoices/${id}/pdf`),
  // Stage 3B-2: partner uploads bank-transfer proof for an invoice in
  // PENDING/OVERDUE status. Status flips to PROOF_UPLOADED; admin
  // notified. SUSPENDED partners may use this as the recovery path.
  uploadPaymentProof: (
    id: string,
    body: { proofUrl: string; proofFileName?: string },
  ) => api.post(`${PARTNER_BASE}/invoices/${id}/upload-proof`, body),

  // Company Profile
  getProfile: () => api.get(`${PARTNER_BASE}/profile`),
  updateCompanyInfo: (body: any) =>
    api.patch(`${PARTNER_BASE}/profile/company-info`, body),
  updateBankDetails: (body: any) =>
    api.patch(`${PARTNER_BASE}/profile/bank-details`, body),
  uploadDocument: (body: {
    type: string;
    fileUrl: string;
    fileName?: string;
    expiryDate?: string;
  }) => api.post(`${PARTNER_BASE}/profile/documents`, body),
  uploadMou: (body: { fileUrl: string; expiryDate: string }) =>
    api.post(`${PARTNER_BASE}/profile/mou`, body),
  uploadLogo: (body: { logoUrl: string }) =>
    api.post(`${PARTNER_BASE}/profile/logo`, body),
  submitProfileForReview: () => api.post(`${PARTNER_BASE}/profile/submit`),
  getTeamMembers: () => api.get(`${PARTNER_BASE}/profile/team`),
  getAvailableRoles: () => api.get(`${PARTNER_BASE}/profile/team/roles`),
  addTeamMember: (body: {
    name: string;
    email: string;
    phone?: string;
    role: string;
  }) => api.post(`${PARTNER_BASE}/profile/team`, body),
  resendTeamMemberInvite: (memberId: string) =>
    api.post(`${PARTNER_BASE}/profile/team/${memberId}/resend`),
  updateTeamMemberRole: (memberId: string, body: { role: string }) =>
    api.patch(`${PARTNER_BASE}/profile/team/${memberId}/role`, body),
  deactivateTeamMember: (memberId: string) =>
    api.patch(`${PARTNER_BASE}/profile/team/${memberId}/deactivate`),
  reactivateTeamMember: (memberId: string) =>
    api.patch(`${PARTNER_BASE}/profile/team/${memberId}/reactivate`),
  removeTeamMember: (memberId: string) =>
    api.delete(`${PARTNER_BASE}/profile/team/${memberId}`),

  // Analytics
  getAnalytics: () => api.get(`${PARTNER_BASE}/analytics`),

  // Notifications
  getNotifications: (params?: Record<string, any>) =>
    api.get(`${PARTNER_BASE}/notifications`, params),
  getUnreadCount: () => api.get(`${PARTNER_BASE}/notifications/unread-count`),
  markNotificationAsRead: (id: string) =>
    api.patch(`${PARTNER_BASE}/notifications/${id}/read`),
  markAllNotificationsAsRead: (body?: { category?: string }) =>
    api.patch(`${PARTNER_BASE}/notifications/read-all`, body),
  dismissNotification: (id: string) =>
    api.delete(`${PARTNER_BASE}/notifications/${id}`),
  clearReadNotifications: () =>
    api.delete(`${PARTNER_BASE}/notifications/clear-read`),
  requestProfileChanges: (body: { fields: string[]; reason: string }) =>
    api.post(`${PARTNER_BASE}/profile/change-request`, body),
  getChangeRequests: () => api.get(`${PARTNER_BASE}/profile/change-requests`),
};

// Shared upload (used by all portals)
export const uploadApi = {
  getSignedUploadUrl: (body: {
    fileName: string;
    fileType: string;
    section: string;
    folder: string;
    entityId: string;
  }) => api.post("/api/v1/upload/signed-url", body),

  getSignedReadUrl: (body: { filePath: string }) =>
    api.post("/api/v1/upload/read-url", body),
};

// ============== VENDOR API ==============

const VENDOR_BASE = "/api/v1/vendor";

export const vendorApi = {
  // Sidebar
  getSidebarBadges: () => api.get(`${VENDOR_BASE}/sidebar-badges`),

  // Dashboard
  getDashboardSummary: () => api.get(`${VENDOR_BASE}/dashboard/summary`),
  getDashboardBookings: (params?: Record<string, any>) =>
    api.get(`${VENDOR_BASE}/dashboard/bookings`, params),
  getCalendarData: (params?: Record<string, any>) =>
    api.get(`${VENDOR_BASE}/dashboard/calendar`, params),
  getTopDrivers: () => api.get(`${VENDOR_BASE}/dashboard/top-drivers`),
  getPendingPayouts: () => api.get(`${VENDOR_BASE}/dashboard/payouts`),

  // Bookings
  getBookings: (params?: Record<string, any>) =>
    api.get(`${VENDOR_BASE}/bookings`, params),
  getBooking: (id: string) => api.get(`${VENDOR_BASE}/bookings/${id}`),
  getAssignmentOptions: (id: string) =>
    api.get(`${VENDOR_BASE}/bookings/${id}/assignment-options`),
  acceptBooking: (id: string, body: { driverId: string; vehicleId: string }) =>
    api.post(`${VENDOR_BASE}/bookings/${id}/accept`, body),
  rejectBooking: (id: string, body: { reason: string }) =>
    api.post(`${VENDOR_BASE}/bookings/${id}/reject`, body),
  startTrip: (id: string) => api.patch(`${VENDOR_BASE}/bookings/${id}/start`),
  completeTrip: (id: string) =>
    api.patch(`${VENDOR_BASE}/bookings/${id}/complete`),
  exportBookingsCsv: (params?: Record<string, any>) =>
    api.get(`${VENDOR_BASE}/bookings/export/csv`, params),

  // Fleet Management (Vehicles)
  getVehicles: (params?: Record<string, any>) =>
    api.get(`${VENDOR_BASE}/fleet`, params),
  addVehicle: (body: any) => api.post(`${VENDOR_BASE}/fleet`, body),
  getVehicle: (id: string) => api.get(`${VENDOR_BASE}/fleet/${id}`),
  updateVehicle: (id: string, body: any) =>
    api.patch(`${VENDOR_BASE}/fleet/${id}`, body),
  uploadVehicleDocument: (
    id: string,
    body: {
      type: string;
      fileUrl: string;
      fileName?: string;
      expiryDate?: string;
    },
  ) => api.post(`${VENDOR_BASE}/fleet/${id}/documents`, body),
  requestVehicleChanges: (
    id: string,
    body: { fields: string[]; reason: string },
  ) => api.post(`${VENDOR_BASE}/fleet/${id}/change-request`, body),
  getVehicleChangeRequests: (id: string) =>
    api.get(`${VENDOR_BASE}/fleet/${id}/change-requests`),
  submitVehicleForReview: (id: string) =>
    api.post(`${VENDOR_BASE}/fleet/${id}/submit`),
  assignDriverToVehicle: (id: string, body: { driverId: string | null }) =>
    api.patch(`${VENDOR_BASE}/fleet/${id}/driver`, body),
  toggleVehicleStatus: (
    id: string,
    body: { action: "activate" | "deactivate" | "maintenance" },
  ) => api.patch(`${VENDOR_BASE}/fleet/${id}/status`, body),
  deleteVehicle: (id: string) => api.delete(`${VENDOR_BASE}/fleet/${id}`),
  getAvailableDrivers: () => api.get(`${VENDOR_BASE}/fleet/available-drivers`),
  getVehicleCatalog: (params?: Record<string, any>) =>
    api.get(`${VENDOR_BASE}/fleet/catalog`, params),

  // Driver Management
  getDrivers: (params?: Record<string, any>) =>
    api.get(`${VENDOR_BASE}/drivers`, params),
  addDriver: (body: any) => api.post(`${VENDOR_BASE}/drivers`, body),
  getDriver: (id: string) => api.get(`${VENDOR_BASE}/drivers/${id}`),
  updateDriver: (id: string, body: any) =>
    api.patch(`${VENDOR_BASE}/drivers/${id}`, body),
  uploadDriverDocument: (
    id: string,
    body: {
      type: string;
      fileUrl: string;
      fileName?: string;
      expiryDate?: string;
    },
  ) => api.post(`${VENDOR_BASE}/drivers/${id}/documents`, body),
  requestDriverChanges: (
    id: string,
    body: { fields: string[]; reason: string },
  ) => api.post(`${VENDOR_BASE}/drivers/${id}/change-request`, body),
  getDriverChangeRequests: (id: string) =>
    api.get(`${VENDOR_BASE}/drivers/${id}/change-requests`),
  submitDriverForReview: (id: string) =>
    api.post(`${VENDOR_BASE}/drivers/${id}/submit`),
  assignVehicleToDriver: (id: string, body: { vehicleId: string | null }) =>
    api.patch(`${VENDOR_BASE}/drivers/${id}/vehicle`, body),
  toggleDriverActive: (id: string) =>
    api.patch(`${VENDOR_BASE}/drivers/${id}/toggle-active`),
  deleteDriver: (id: string) => api.delete(`${VENDOR_BASE}/drivers/${id}`),
  getAvailableVehicles: () =>
    api.get(`${VENDOR_BASE}/drivers/available-vehicles`),
  verifyDriverPhoto: async (file: File) => {
    const formData = new FormData();
    formData.append("photo", file);
    const response = await fetch(
      `${API_URL}${VENDOR_BASE}/drivers/verify-photo`,
      {
        method: "POST",
        credentials: "include",
        body: formData,
      },
    );
    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.message || data.error || "Photo verification failed",
        data,
      );
    }
    return data as ApiResponse<{ passed: boolean; message: string }>;
  },

  // Earnings & Payouts
  getEarningsSummary: () => api.get(`${VENDOR_BASE}/earnings/summary`),
  getReceipts: (params?: Record<string, any>) =>
    api.get(`${VENDOR_BASE}/earnings/receipts`, params),
  getReceipt: (id: string) => api.get(`${VENDOR_BASE}/earnings/receipts/${id}`),
  // Note: uploadPaymentProof was removed in Stage 3B. Under the new
  // payment direction, admin pays vendor (not the reverse), so vendors
  // no longer upload payment proofs. The backend endpoint returns 410
  // GONE. Frontend should show admin's uploaded receipt to vendor
  // instead (already surfaced via earnings/receipts/:id response's
  // `paymentProofUrl` field which now points to admin's receipt).
  downloadReceiptPdf: (id: string) =>
    api.get(`${VENDOR_BASE}/earnings/receipts/${id}/pdf`),

  // Company Profile
  getProfile: () => api.get(`${VENDOR_BASE}/profile`),
  updateCompanyInfo: (body: any) =>
    api.patch(`${VENDOR_BASE}/profile/company-info`, body),
  updateBankDetails: (body: {
    bankName: string;
    bankAccountName?: string;
    bankIban: string;
  }) => api.patch(`${VENDOR_BASE}/profile/bank-details`, body),
  uploadDocument: (body: {
    type: string;
    fileUrl: string;
    fileName?: string;
    expiryDate?: string;
  }) => api.post(`${VENDOR_BASE}/profile/documents`, body),
  uploadMou: (body: { fileUrl: string; expiryDate: string }) =>
    api.post(`${VENDOR_BASE}/profile/mou`, body),
  uploadLogo: (body: { logoUrl: string }) =>
    api.post(`${VENDOR_BASE}/profile/logo`, body),
  submitProfileForReview: () => api.post(`${VENDOR_BASE}/profile/submit`),
  requestProfileChanges: (body: { fields: string[]; reason: string }) =>
    api.post(`${VENDOR_BASE}/profile/change-request`, body),
  getProfileChangeRequests: () =>
    api.get(`${VENDOR_BASE}/profile/change-requests`),
  getTeamMembers: () => api.get(`${VENDOR_BASE}/profile/team`),
  getAvailableRoles: () => api.get(`${VENDOR_BASE}/profile/roles`),

  // Reports & Analytics
  getAnalytics: (params?: Record<string, any>) =>
    api.get(`${VENDOR_BASE}/analytics`, params),
  exportAnalyticsReport: (params?: Record<string, any>) =>
    api.get(`${VENDOR_BASE}/analytics/export`, params),

  // Notifications
  getNotifications: (params?: Record<string, any>) =>
    api.get(`${VENDOR_BASE}/notifications`, params),
  markNotificationAsRead: (id: string) =>
    api.patch(`${VENDOR_BASE}/notifications/${id}/read`),
  markAllNotificationsAsRead: (category?: string) =>
    api.patch(
      `${VENDOR_BASE}/notifications/mark-all-read${category ? `?category=${category}` : ""}`,
    ),
};

// ============== INVITATION API ==============
// Public endpoints for the vendor/partner invitation-acceptance flow.
// Backed by /api/v1/invitation/:type/:token on the server side
// (see route/auth/invitation.route.ts). No auth middleware — anyone
// with the token can read and accept. The accept endpoint sets a
// session cookie via Set-Cookie before returning, so the invite
// page can navigate straight into the portal.

export const invitationApi = {
  // Fetches invitation context (companyName, email, etc.) so the
  // welcome screen can render personalized copy before the recipient
  // sets their password.
  get: (type: "vendor" | "partner", token: string) =>
    api.get(`/api/v1/invitation/${type}/${token}`),

  // Sets the recipient's password and transitions them to ONBOARDING.
  // Response includes a session cookie — caller can do a hard
  // navigation into the dashboard immediately.
  accept: (
    type: "vendor" | "partner",
    token: string,
    body: {
      password: string;
      firstName: string;
      lastName: string;
      phone?: string;
    },
  ) => api.post(`/api/v1/invitation/${type}/${token}/accept`, body),
};

export default api;
