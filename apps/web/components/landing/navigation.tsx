"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Calendar,
  Plus,
  User,
  Headphones,
  X,
  LogOut,
  LayoutDashboard,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import Logo from "@/components/shared/logo";
import { proxiedImageUrl } from "@/lib/image-url";

// ============================================
// Small avatar component: renders the user's image when available,
// falls back to a Lucide User icon when no image is set or the image
// fails to load. Used in the desktop nav (40px) and the mobile menu
// header (48px).
//
// Why a local component instead of ProfileImage:
// ProfileImage's `fill` mode renders absolutely-positioned children
// that need a `position: relative` parent. Getting that wrong (which
// I did) makes the image escape and cover the entire page. For a
// fixed-size avatar this is more machinery than the use case needs —
// a direct <img> with object-cover is both simpler and easier to
// reason about. We still route through `proxiedImageUrl` so GCS
// signed URLs are converted to proxy URLs (smaller payload + retina
// sizing) the same way ProfileImage does internally.
// ============================================
function Avatar({
  image,
  alt,
  sizeClass,
  iconClass,
}: {
  image: string | null | undefined;
  alt: string;
  sizeClass: string;
  iconClass: string;
}) {
  const [failed, setFailed] = useState(false);
  // proxiedImageUrl handles three cases:
  //   - null/undefined → returns null → fallback icon path
  //   - GCS signed URL → returns proxy URL
  //   - any other URL → returns as-is (will load directly or fail
  //     gracefully via onError)
  const cssWidth = parseInt(sizeClass.match(/w-(\d+)/)?.[1] ?? "10", 10) * 4;
  const url = !failed ? proxiedImageUrl(image, cssWidth) : null;

  return (
    <div
      className={`${sizeClass} rounded-full border border-luxury-gold/50 bg-luxury-gold/20 flex items-center justify-center overflow-hidden flex-shrink-0`}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <User className={`${iconClass} text-luxury-gold`} />
      )}
    </div>
  );
}

export default function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout, setShowLoginModal, setAuthModalMode } =
    useAuth();

  // Handle scroll for header styling
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Track active section with IntersectionObserver for accuracy
  useEffect(() => {
    if (pathname !== "/") return;

    const sections = [
      "hero",
      "services",
      "fleet",
      "about",
      "partnership",
      "contact",
    ];
    const sectionElements = sections
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    if (sectionElements.length === 0) return;

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      // Find the topmost visible section in viewport
      let topSection: { id: string; top: number } | null = null as {
        id: string;
        top: number;
      } | null;

      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const rect = entry.boundingClientRect;
          if (!topSection || rect.top < topSection.top) {
            topSection = { id: entry.target.id, top: rect.top };
          }
        }
      });

      if (topSection) {
        setActiveSection(topSection.id);
      }
    };

    const observer = new IntersectionObserver(observerCallback, {
      root: null,
      rootMargin: "-80px 0px -50% 0px",
      threshold: 0,
    });

    sectionElements.forEach((el) => observer.observe(el));

    // Set initial section
    setActiveSection("hero");

    return () => observer.disconnect();
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileMenuOpen]);

  const navLinks = [
    { label: "Home", href: "/" },
    { label: "Services", href: "/#services" },
    { label: "Fleet", href: "/#fleet" },
    { label: "Partnership", href: "/#partnership" },
    { label: "About", href: "/#about" },
    { label: "Contact", href: "/#contact" },
  ];

  const getDashboardLink = () => {
    if (!user) return "/dashboard";
    switch (user.role) {
      case "CUSTOMER":
        return "/dashboard/customer";
      case "SALES":
        return "/dashboard/sales";
      case "OPERATIONS":
        return "/dashboard/operations";
      case "ADMIN":
        return "/dashboard/admin";
      case "PARTNER":
        return "/dashboard/partner";
      case "VENDOR":
        return "/dashboard/vendor";
      default:
        return "/dashboard";
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/");
    setIsMobileMenuOpen(false);
  };

  const bottomNavItems = [
    { label: "Home", href: "/", icon: Home },
    { label: "Bookings", href: "/dashboard/customer", icon: Calendar },
    { label: "Book", href: "/#hero", icon: Plus, isCenter: true },
    { label: "Profile", href: "/dashboard/customer", icon: User },
    { label: "Support", href: "/contact", icon: Headphones },
  ];

  return (
    <>
      {/* Main Navigation Header */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? "bg-luxury-dark/95 backdrop-blur-md shadow-lg"
            : "bg-gradient-to-b from-luxury-dark to-luxury-dark/80 backdrop-blur-md"
        }`}
      >
        {/* Gold accent line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-luxury-gold/30 to-transparent" />

        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Logo size="md" showTagline={true} className="hidden sm:flex" />
            <Logo size="sm" showTagline={false} className="sm:hidden" />

            {/* Center Navigation - Desktop */}
            <div className="hidden lg:flex items-center gap-8">
              {navLinks.map((link) => {
                // Determine if this link is active - only ONE link should be active at a time
                let isActive = false;

                if (pathname === "/") {
                  // On homepage, use section-based highlighting
                  if (link.href === "/" && activeSection === "hero")
                    isActive = true;
                  else if (
                    link.href === "/#services" &&
                    activeSection === "services"
                  )
                    isActive = true;
                  else if (link.href === "/#fleet" && activeSection === "fleet")
                    isActive = true;
                  else if (link.href === "/#about" && activeSection === "about")
                    isActive = true;
                  else if (
                    link.href === "/#partnership" &&
                    activeSection === "partnership"
                  )
                    isActive = true;
                  else if (
                    link.href === "/#contact" &&
                    activeSection === "contact"
                  )
                    isActive = true;
                } else {
                  // On other pages, match by pathname
                  isActive = pathname === link.href;
                }

                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={`text-sm font-medium transition-colors duration-300 relative group ${
                      isActive
                        ? "text-luxury-gold"
                        : "text-gray-300 hover:text-luxury-gold"
                    }`}
                  >
                    {link.label}
                    <span
                      className={`absolute -bottom-1 left-0 h-0.5 bg-luxury-gold transition-all duration-300 ${
                        isActive ? "w-full" : "w-0 group-hover:w-full"
                      }`}
                    />
                  </Link>
                );
              })}
            </div>

            {/* Right Section - Desktop */}
            <div className="hidden lg:flex items-center gap-4">
              {isAuthenticated && user ? (
                <div className="flex items-center gap-4">
                  <Link
                    href={getDashboardLink()}
                    className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-luxury-gold transition-colors"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-luxury-gold transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                  <div className="flex items-center gap-3 pl-4 border-l border-gray-700">
                    <div className="text-right">
                      <p className="text-sm font-medium text-white">
                        {user.name ?? user.email}
                      </p>
                      <p className="text-xs text-luxury-gold capitalize">
                        {user.role}
                      </p>
                    </div>
                    {/* Avatar: simple direct img with the resize-proxy
                        helper. Renders the User icon when no image is
                        set OR when the img fails to load (e.g. expired
                        signed URL). Keeping this simple — no fill mode,
                        no shimmer — because at 40px the load is fast
                        enough that a shimmer would be more visual noise
                        than help. */}
                    <Avatar
                      image={user.image}
                      alt={user.name ?? user.email}
                      sizeClass="w-10 h-10"
                      iconClass="w-5 h-5"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setAuthModalMode("signin");
                      setShowLoginModal(true);
                    }}
                    className="px-5 py-2 text-sm font-semibold text-gray-300 hover:text-white transition-all duration-300"
                  >
                    Login
                  </button>
                  <button
                    onClick={() => {
                      setAuthModalMode("register");
                      setShowLoginModal(true);
                    }}
                    className="px-5 py-2 text-sm font-semibold text-luxury-gold border border-luxury-gold/50 hover:border-luxury-gold rounded-lg transition-all duration-300 bg-white/5 hover:bg-white/10"
                  >
                    Register
                  </button>
                </>
              )}
            </div>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden w-11 h-11 flex items-center justify-center rounded-lg bg-white/5 border border-white/10"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            >
              <div className="relative w-6 h-5 flex flex-col justify-center items-center">
                <span
                  className={`absolute w-6 h-0.5 bg-white transition-all duration-300 ${
                    isMobileMenuOpen ? "rotate-45" : "-translate-y-2"
                  }`}
                />
                <span
                  className={`absolute w-6 h-0.5 bg-white transition-all duration-300 ${
                    isMobileMenuOpen ? "opacity-0 scale-0" : "opacity-100"
                  }`}
                />
                <span
                  className={`absolute w-6 h-0.5 bg-white transition-all duration-300 ${
                    isMobileMenuOpen ? "-rotate-45" : "translate-y-2"
                  }`}
                />
              </div>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu - Full Screen Overlay */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-all duration-300 ${
          isMobileMenuOpen ? "visible" : "invisible"
        }`}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
            isMobileMenuOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setIsMobileMenuOpen(false)}
        />

        {/* Menu Panel - Slide from right */}
        <div
          className={`absolute top-0 right-0 h-full w-full max-w-sm bg-luxury-dark border-l border-luxury-gold/20 shadow-2xl transition-transform duration-300 ease-out ${
            isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Close Button */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white hover:text-luxury-gold transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          {/* User Info if logged in */}
          {isAuthenticated && user && (
            <div className="px-6 pt-6 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Avatar
                  image={user.image}
                  alt={user.name ?? user.email}
                  sizeClass="w-12 h-12"
                  iconClass="w-6 h-6"
                />
                <div>
                  <p className="font-medium text-white">
                    {user.name ?? user.email}
                  </p>
                  <p className="text-sm text-luxury-gold capitalize">
                    {user.role}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Menu Content */}
          <div
            className={`flex flex-col h-full ${isAuthenticated ? "pt-4" : "pt-20"} pb-8 px-6`}
          >
            {/* Nav Links */}
            <nav className="flex-1">
              <ul className="space-y-2">
                {navLinks.map((link, index) => {
                  let isActive = false;

                  if (pathname === "/") {
                    if (link.href === "/" && activeSection === "hero")
                      isActive = true;
                    else if (
                      link.href === "/#services" &&
                      activeSection === "services"
                    )
                      isActive = true;
                    else if (
                      link.href === "/#fleet" &&
                      activeSection === "fleet"
                    )
                      isActive = true;
                    else if (
                      link.href === "/#about" &&
                      activeSection === "about"
                    )
                      isActive = true;
                    else if (
                      link.href === "/#partnership" &&
                      activeSection === "partnership"
                    )
                      isActive = true;
                    else if (
                      link.href === "/#contact" &&
                      activeSection === "contact"
                    )
                      isActive = true;
                  } else {
                    isActive = pathname === link.href;
                  }

                  return (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`block py-3 px-4 text-lg font-medium rounded-lg transition-all duration-300 ${
                          isActive
                            ? "text-luxury-gold bg-luxury-gold/10"
                            : "text-gray-300 hover:text-white hover:bg-white/5"
                        }`}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {/* Divider */}
              <div className="my-6 h-px bg-gradient-to-r from-transparent via-luxury-gold/30 to-transparent" />

              {/* Book Now Button - only for logged in users */}
              {isAuthenticated && (
                <Link
                  href="/#hero"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block w-full py-4 text-center text-lg font-semibold text-luxury-dark bg-luxury-gold hover:bg-luxury-gold/90 rounded-xl transition-all duration-300 shadow-lg shadow-luxury-gold/20 mb-4"
                >
                  Book Now
                </Link>
              )}

              {/* Auth Links */}
              <div className="space-y-2">
                {isAuthenticated && user ? (
                  <>
                    <Link
                      href={getDashboardLink()}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-3 py-3 px-4 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-300"
                    >
                      <LayoutDashboard className="w-5 h-5" />
                      Dashboard
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 w-full text-left py-3 px-4 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-300"
                    >
                      <LogOut className="w-5 h-5" />
                      Logout
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setShowLoginModal(true);
                    }}
                    className="block w-full py-3 px-4 text-center text-luxury-gold border border-luxury-gold/50 hover:bg-luxury-gold/10 rounded-lg transition-all duration-300"
                  >
                    Login / Register
                  </button>
                )}
              </div>
            </nav>

            {/* Social Icons */}
            <div className="pt-6 border-t border-white/10">
              <p className="text-xs text-gray-500 mb-3">Follow us</p>
              <div className="flex gap-4">
                {["Instagram", "Twitter", "LinkedIn"].map((social) => (
                  <a
                    key={social}
                    href="#"
                    className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-luxury-gold hover:border-luxury-gold/50 transition-all duration-300"
                  >
                    <span className="text-xs font-medium">{social[0]}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation - Mobile Only (when logged in) */}
      {isAuthenticated && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-luxury-dark/95 backdrop-blur-md border-t border-luxury-gold/20 safe-area-pb">
          <div className="flex items-center justify-around px-2 py-2">
            {bottomNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              if (item.isCenter) {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="relative -mt-6"
                  >
                    <div className="w-14 h-14 rounded-full bg-luxury-gold flex items-center justify-center shadow-lg shadow-luxury-gold/40">
                      <Icon className="w-7 h-7 text-luxury-dark" />
                    </div>
                  </Link>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex flex-col items-center gap-1 py-2 px-3 min-w-[60px] transition-colors duration-300 ${
                    isActive ? "text-luxury-gold" : "text-gray-500"
                  }`}
                >
                  <Icon
                    className={`w-6 h-6 ${isActive ? "fill-luxury-gold" : ""}`}
                  />
                  <span className="text-xs font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
