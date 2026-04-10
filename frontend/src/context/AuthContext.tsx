/**
 * AuthContext.tsx
 * Manages authentication state across the entire app.
 * Wrap your App with <AuthProvider> to use useAuth() anywhere.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  authApi,
  saveTokens,
  saveUser,
  clearTokens,
  getUser,
  getAccessToken,
} from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────

interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "voter" | "admin" | "superadmin";
  is_verified: boolean;
  preferred_language: string;
  created_at: string;
  last_login_at: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;

  // OTP flow
  requestOTP: (channel: "email" | "sms", contact: string) => Promise<string>;
  verifyOTP: (channel: "email" | "sms", contact: string, code: string, name?: string) => Promise<void>;

  // Admin flow
  adminLogin: (email: string, password: string) => Promise<void>;
  adminRegister: (data: {
    name: string;
    email: string;
    password: string;
    organization?: string;
  }) => Promise<void>;

  logout: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser]       = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage on app start
  useEffect(() => {
    const token     = getAccessToken();
    const savedUser = getUser();
    if (token && savedUser) {
      setUser(savedUser);
    }
    setIsLoading(false);
  }, []);

  // ── OTP Flow ────────────────────────────────────────────────────

  const requestOTP = async (channel: "email" | "sms", contact: string): Promise<string> => {
    const response = await authApi.requestOTP(channel, contact, "login");
    // In dev mode, the OTP code is returned in debug_code
    return response.debug_code || "";
  };

  const verifyOTP = async (
    channel: "email" | "sms",
    contact: string,
    code: string,
    name?: string
  ) => {
    const response = await authApi.verifyOTP(channel, contact, code, name);
    saveTokens(response.tokens.access, response.tokens.refresh);
    saveUser(response.user);
    setUser(response.user);
  };

  // ── Admin Flow ───────────────────────────────────────────────────

  const adminLogin = async (email: string, password: string) => {
    const response = await authApi.adminLogin(email, password);
    saveTokens(response.tokens.access, response.tokens.refresh);
    saveUser(response.user);
    setUser(response.user);
  };

  const adminRegister = async (data: {
    name: string;
    email: string;
    password: string;
    organization?: string;
  }) => {
    await authApi.adminRegister(data);
    // After register, user needs to verify email then wait for approval
  };

  // ── Logout ───────────────────────────────────────────────────────

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if logout API fails, clear local state
    }
    clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === "admin" || user?.role === "superadmin",
        isLoading,
        requestOTP,
        verifyOTP,
        adminLogin,
        adminRegister,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
};
