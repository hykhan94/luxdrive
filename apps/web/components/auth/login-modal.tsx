"use client";

import { useState } from "react";
import { PhoneInput, EmailInput } from "@/components/ui/form-fields";
import { useRouter } from "next/navigation";
import {
  X,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  User,
  Phone,
  Calendar,
} from "lucide-react";
import { useAuth, getDashboardRoute } from "@/lib/auth-context";
import Logo from "@/components/shared/logo";
import { useNotification } from "@/lib/notification-context";

export default function LoginModal() {
  const {
    showLoginModal,
    setShowLoginModal,
    login,
    register,
    authModalMode,
    setAuthModalMode,
  } = useAuth();
  const { showNotification } = useNotification();
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!showLoginModal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (authModalMode === "register") {
      if (!name.trim()) {
        setError("Full name is required");
        setIsLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        setIsLoading(false);
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters");
        setIsLoading(false);
        return;
      }

      const result = await register({
        email,
        password,
        name: name.trim(),
        phone: phone || undefined,
        dob: dateOfBirth || undefined,
      });

      if (result.success) {
        showNotification(
          "success",
          "Account created successfully! Welcome to LuxDrive.",
        );
        handleClose();
        router.push("/");
      } else {
        setError(result.error || "Registration failed");
      }

      setIsLoading(false);
      return;
    }

    // Sign in — login() now returns { success, error, role }
    const result = await login(email, password);

    if (result.success) {
      showNotification("success", "Welcome back! Signed in successfully.");
      handleClose();

      // Route immediately using the role returned from login()
      if (result.role) {
        const route = getDashboardRoute(result.role);
        router.push(route);
      }
    } else {
      setError(result.error || "Login failed");
    }

    setIsLoading(false);
  };

  const handleClose = () => {
    setShowLoginModal(false);
    setName("");
    setPhone("");
    setDateOfBirth("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
  };

  const switchMode = () => {
    setAuthModalMode(authModalMode === "signin" ? "register" : "signin");
    setError("");
    setName("");
    setPhone("");
    setDateOfBirth("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative w-full max-w-md mx-4 bg-[#0f0f0f] border border-neutral-800 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="px-8 pt-8 pb-6 text-center border-b border-neutral-800">
          <div className="flex justify-center mb-4">
            <Logo size="lg" showTagline={false} linkTo={null} />
          </div>
          <h2 className="text-2xl font-serif text-white mb-2">
            {authModalMode === "signin" ? "Welcome Back" : "Create Account"}
          </h2>
          <p className="text-neutral-400 text-sm">
            {authModalMode === "signin"
              ? "Sign in to continue your journey"
              : "Register to get started"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {authModalMode === "register" && (
            <div>
              <label className="block text-sm text-neutral-400 mb-2">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                  className="w-full pl-12 pr-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-[#C9A961] transition-colors"
                />
              </div>
            </div>
          )}

          {authModalMode === "register" && (
            <div>
              <label className="block text-sm text-neutral-400 mb-2">
                Phone Number
              </label>
              <PhoneInput value={phone} onChange={setPhone} label="" />
            </div>
          )}

          {authModalMode === "register" && (
            <div>
              <label className="block text-sm text-neutral-400 mb-2">
                Date of Birth
                <span className="text-neutral-500 text-xs ml-2">
                  (For birthday rewards)
                </span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-[#C9A961] transition-colors [color-scheme:dark]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm text-neutral-400 mb-2">Email</label>
            <EmailInput value={email} onChange={setEmail} label="" required />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  authModalMode === "signin"
                    ? "Enter your password"
                    : "Create a password"
                }
                required
                className="w-full pl-12 pr-12 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-[#C9A961] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {authModalMode === "register" && (
            <div>
              <label className="block text-sm text-neutral-400 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                  className="w-full pl-12 pr-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-[#C9A961] transition-colors"
                />
              </div>
            </div>
          )}

          {/* Forgot password — only relevant on the sign-in tab. Closes
              the modal first so the user lands cleanly on the
              dedicated reset-request page. */}
          {authModalMode === "signin" && (
            <div className="flex justify-end -mt-2">
              <a
                href="/forgot-password"
                onClick={() => setShowLoginModal(false)}
                className="text-xs text-neutral-400 hover:text-[#C9A961] transition-colors"
              >
                Forgot password?
              </a>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-[#C9A961] hover:bg-[#d4b872] disabled:opacity-50 text-black font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {authModalMode === "signin"
                  ? "Signing in..."
                  : "Creating account..."}
              </>
            ) : authModalMode === "signin" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>

          <div className="text-center">
            <p className="text-neutral-400 text-sm">
              {authModalMode === "signin"
                ? "Don't have an account?"
                : "Already have an account?"}
              <button
                type="button"
                onClick={switchMode}
                className="ml-2 text-[#C9A961] hover:text-[#d4b872] font-medium transition-colors"
              >
                {authModalMode === "signin" ? "Register" : "Sign In"}
              </button>
            </p>
          </div>

          {/* {authModalMode === "signin" && (
            <div className="pt-4 border-t border-neutral-800">
              <p className="text-xs text-neutral-500 mb-3 text-center">
                Demo Credentials
              </p>
              <div className="space-y-2 text-xs">
                {[
                  {
                    label: "Admin",
                    email: "admin@luxdrive.sa",
                    password: "admin123",
                    color: "neutral",
                  },
                  {
                    label: "Customer",
                    email: "customer@luxdrive.sa",
                    password: "customer123",
                    color: "neutral",
                  },
                  {
                    label: "Partner",
                    email: "partner@acmecorp.sa",
                    password: "partner123",
                    color: "purple",
                  },
                  {
                    label: "Vendor",
                    email: "vendor@saudilimo.sa",
                    password: "vendor123",
                    color: "orange",
                  },
                ].map((cred) => (
                  <button
                    key={cred.email}
                    type="button"
                    onClick={() => {
                      setEmail(cred.email);
                      setPassword(cred.password);
                    }}
                    className={`w-full flex justify-between text-neutral-400 p-2 rounded transition-colors ${
                      cred.color === "purple"
                        ? "bg-purple-900/30 border border-purple-500/20 hover:border-purple-500/40"
                        : cred.color === "orange"
                          ? "bg-orange-900/30 border border-orange-500/20 hover:border-orange-500/40"
                          : "bg-neutral-900/50 hover:bg-neutral-800/50"
                    }`}
                  >
                    <span
                      className={
                        cred.color === "purple"
                          ? "text-purple-400"
                          : cred.color === "orange"
                            ? "text-orange-400"
                            : ""
                      }
                    >
                      {cred.label}:
                    </span>
                    <span
                      className={
                        cred.color === "purple"
                          ? "text-purple-300"
                          : cred.color === "orange"
                            ? "text-orange-300"
                            : "text-neutral-300"
                      }
                    >
                      {cred.email}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )} */}
        </form>
      </div>
    </div>
  );
}
