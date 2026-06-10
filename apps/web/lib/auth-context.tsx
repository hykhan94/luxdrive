"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { authApi, ApiError } from "./api";

// ============== TYPES ==============

export type UserRole =
  | "CUSTOMER"
  | "PARTNER"
  | "VENDOR"
  | "ADMIN"
  | "SALES"
  | "OPERATIONS"
  | "FINANCE";

export interface User {
  id: string;
  email: string;
  name: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  image?: string | null;
  role: UserRole;
  dob?: string | null;
  loyaltyTier?: string;
  loyaltyPoints?: number;
  isActive?: boolean;
}

export type AuthModalMode = "signin" | "register";

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string; role?: UserRole }>;
  register: (data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    dob?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  showLoginModal: boolean;
  setShowLoginModal: (show: boolean) => void;
  authModalMode: AuthModalMode;
  setAuthModalMode: (mode: AuthModalMode) => void;
}

// ============== CONTEXT ==============

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>("signin");

  /**
   * Parse user data from Better Auth session response
   */
  const parseUser = (sessionUser: any): User => ({
    id: sessionUser.id,
    email: sessionUser.email,
    name: sessionUser.name,
    firstName: sessionUser.firstName,
    lastName: sessionUser.lastName,
    phone: sessionUser.phone,
    image: sessionUser.image,
    role: (sessionUser.role || "CUSTOMER") as UserRole,
    dob: sessionUser.dob,
    loyaltyTier: sessionUser.loyaltyTier,
    loyaltyPoints: sessionUser.loyaltyPoints,
    isActive: sessionUser.isActive,
  });

  /**
   * Validate session on mount — retries once if backend isn't ready yet.
   *
   * After confirming the session, we also fetch the role-appropriate
   * avatar URL from /api/v1/me/avatar and overwrite user.image with
   * it. The reason: Better Auth's session endpoint returns only the
   * raw User.image column, which is null for vendor/partner users
   * (their avatar lives on Vendor.logoUrl / Partner.logoUrl). The
   * /me/avatar endpoint picks the correct field per role AND signs
   * the GCS path so the browser can actually load it. Without this
   * call the navbar showed the generic User icon for every vendor
   * and partner even when they had a company logo uploaded.
   */
  const refreshSession = useCallback(async (retryCount = 0) => {
    try {
      const session = await authApi.getSession();
      if (session?.user) {
        const parsed = parseUser(session.user);
        // Fetch role-aware avatar in parallel-friendly fashion. We
        // don't await before setting the user so the rest of the app
        // can hydrate without blocking on the avatar request — the
        // navbar shows the User-icon fallback for a few hundred ms
        // before flipping to the real image. Standard progressive
        // enhancement.
        setUser(parsed);
        try {
          const avatarUrl = await authApi.getMyAvatar();
          if (avatarUrl) {
            setUser((prev) => (prev ? { ...prev, image: avatarUrl } : prev));
          }
        } catch {
          // Avatar fetch is best-effort — fallback icon will show.
        }
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Small delay on initial mount to avoid hitting backend before it's ready
    // This only affects the very first page load during development
    const timer = setTimeout(() => {
      refreshSession();
    }, 500);
    return () => clearTimeout(timer);
  }, [refreshSession]);

  /**
   * Login — returns { success, error, role } so callers can route immediately
   */
  const login = async (
    email: string,
    password: string,
  ): Promise<{ success: boolean; error?: string; role?: UserRole }> => {
    try {
      await authApi.signIn(email, password);

      // Fetch full session to get user data with role
      const session = await authApi.getSession();

      if (session?.user) {
        const parsedUser = parseUser(session.user);
        setUser(parsedUser);

        // Same avatar-enrichment as refreshSession — fetch the role-
        // aware signed URL from /api/v1/me/avatar and patch user.image
        // so the navbar renders the correct logo for vendor/partner
        // users immediately after sign-in rather than after the next
        // page refresh. Best-effort: fallback icon shows if the fetch
        // fails.
        try {
          const avatarUrl = await authApi.getMyAvatar();
          if (avatarUrl) {
            setUser((prev) => (prev ? { ...prev, image: avatarUrl } : prev));
          }
        } catch {
          // Avatar fetch is best-effort
        }

        return { success: true, role: parsedUser.role };
      }

      return {
        success: false,
        error: "Could not retrieve session after login",
      };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Login failed. Please try again.";
      return { success: false, error: message };
    }
  };

  /**
   * Register a new customer account
   */
  const register = async (data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    dob?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      await authApi.signUp(data);
      await refreshSession();
      return { success: true };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Registration failed. Please try again.";
      return { success: false, error: message };
    }
  };

  /**
   * Logout
   */
  const logout = async () => {
    await authApi.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        refreshSession,
        showLoginModal,
        setShowLoginModal,
        authModalMode,
        setAuthModalMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// ============== HELPERS ==============

/**
 * Get the dashboard route for a given role
 */
export function getDashboardRoute(role: UserRole): string {
  console.log(role);
  switch (role) {
    case "ADMIN":
      return "/dashboard/admin";
    case "SALES":
      return "/dashboard/sales";
    case "OPERATIONS":
      return "/dashboard/operations";
    case "PARTNER":
      return "/dashboard/partner";
    case "VENDOR":
      return "/dashboard/vendor";
    case "CUSTOMER":
    default:
      return "/";
  }
}

export function isAdminRole(role: UserRole): boolean {
  return role === "ADMIN";
}

export function isStaffRole(role: UserRole): boolean {
  return ["ADMIN", "SALES", "OPERATIONS", "FINANCE"].includes(role);
}
