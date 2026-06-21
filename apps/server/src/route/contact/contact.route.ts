// ============================================
// src/route/contact/contact.route.ts
// Public contact form submission route.
// ============================================

import { Router } from "express";
import { submitContactForm } from "../../controller/contact/contact.controller";

const router = Router();

// POST /api/v1/contact
// Public — no auth middleware. The submitContactForm handler does
// its own input validation and rate-shaping via length caps.
//
// If abuse becomes a concern, layer an express-rate-limit middleware
// here BEFORE submitContactForm. Example (when needed):
//
//   import rateLimit from "express-rate-limit";
//   const contactLimiter = rateLimit({
//     windowMs: 15 * 60 * 1000,
//     max: 5,
//     standardHeaders: true,
//     message: { success: false, message: "Too many submissions. Please try again in 15 minutes." }
//   });
//   router.post("/", contactLimiter, submitContactForm);
router.post("/", submitContactForm);

export default router;
