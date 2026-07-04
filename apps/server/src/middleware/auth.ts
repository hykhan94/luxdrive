import { Request, Response, NextFunction } from "express";
import { auth } from "../lib/auth";
import { AppError } from "../utils/AppError";
import { HttpStatus } from "../utils/httpStatus";

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string | null;
        role: string;
      };
      session?: {
        id: string;
        userId: string;
        token: string;
        expiresAt: Date;
      };
    }
  }
}

// Middleware to check if user is authenticated
export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as any,
    });

    if (!session) {
      throw new AppError(
        "Unauthorized - Please login",
        HttpStatus.UNAUTHORIZED,
        "UNAUTHORIZED",
      );
    }

    // Fetch full user with role from database
    const { prisma } = await import("../lib/prisma");
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      throw new AppError(
        "User not found",
        HttpStatus.UNAUTHORIZED,
        "USER_NOT_FOUND",
      );
    }

    req.user = user;
    req.session = session.session as any;
    next();
  } catch (error) {
    next(error);
  }
};

// Middleware to check user role
export const hasRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(
        new AppError("Unauthorized", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED"),
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Required role: ${allowedRoles.join(" or ")}`,
          HttpStatus.FORBIDDEN,
          "FORBIDDEN",
        ),
      );
    }

    next();
  };
};

// Combined middleware for admin routes
export const isAdmin = [isAuthenticated, hasRole("ADMIN")];

// Combined middleware for internal staff (Admin, Sales, Operations, Finance)
export const isStaff = [
  isAuthenticated,
  hasRole("ADMIN", "SALES", "OPERATIONS", "FINANCE"),
];

// Combined middleware for partners
export const isPartner = [isAuthenticated, hasRole("PARTNER")];

/**
 * Blocks partner API access when the partner is SUSPENDED. Used to gate
 * every partner-scoped route EXCEPT the suspension-info endpoint the
 * dashboard reads to render the "your account is suspended" screen.
 *
 * Returns 403 with a specific code the frontend intercepts and redirects
 * to /dashboard rather than showing a generic error. Because status lives
 * on the Partner (not User), we look it up per-request — cheap since the
 * userId → partner index exists, and status changes need to take effect
 * immediately (an admin suspend should log the partner out of their
 * dashboard actions within the next click).
 */
export const isActivePartner = [
  isAuthenticated,
  hasRole("PARTNER"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { prisma } = await import("../lib/prisma");
      const partner = await prisma.partner.findUnique({
        where: { userId: req.user!.id },
        select: { status: true },
      });
      if (!partner) {
        return next(
          new AppError(
            "Partner profile not found",
            HttpStatus.NOT_FOUND,
            "PARTNER_NOT_FOUND",
          ),
        );
      }
      if (partner.status === "SUSPENDED") {
        return next(
          new AppError(
            "Your account has been suspended by the admin.",
            HttpStatus.FORBIDDEN,
            "PARTNER_SUSPENDED",
          ),
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  },
];

// Combined middleware for vendors
export const isVendor = [isAuthenticated, hasRole("VENDOR")];

// Combined middleware for customers
export const isCustomer = [isAuthenticated, hasRole("CUSTOMER")];
