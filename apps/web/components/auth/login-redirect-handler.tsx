"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * Auto-opens the login modal when redirected from protected routes
 * (middleware adds ?login=true to the URL)
 */
export default function LoginRedirectHandler() {
  const searchParams = useSearchParams();
  const { setShowLoginModal, isAuthenticated } = useAuth();

  useEffect(() => {
    if (searchParams.get("login") === "true" && !isAuthenticated) {
      setShowLoginModal(true);

      // Clean up the URL param without a page reload
      const url = new URL(window.location.href);
      url.searchParams.delete("login");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams, isAuthenticated, setShowLoginModal]);

  return null;
}
