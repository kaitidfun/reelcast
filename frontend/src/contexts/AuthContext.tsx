import React, { createContext, useContext, useState, useCallback } from "react";

export interface MockUser {
  id: string;
  email: string;
  displayName: string;
  avatar: string;
  plan: "free" | "pro" | "enterprise";
  joinedAt: string;
}

const MOCK_USER: MockUser = {
  id: "usr_001",
  email: "creator@reelcast.ai",
  displayName: "Alex Creator",
  avatar: "",
  plan: "pro",
  joinedAt: "2025-09-15",
};

interface AuthContextType {
  user: MockUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (updates: Partial<MockUser>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<MockUser | null>(() => {
    const saved = localStorage.getItem("rf_mock_user");
    return saved ? JSON.parse(saved) : null;
  });

  const login = useCallback(async (email: string, _password: string) => {
    // Mock: accept any non-empty credentials
    if (!email) return false;
    const mockUser = { ...MOCK_USER, email };
    setUser(mockUser);
    localStorage.setItem("rf_mock_user", JSON.stringify(mockUser));
    return true;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("rf_mock_user");
  }, []);

  const updateProfile = useCallback((updates: Partial<MockUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      localStorage.setItem("rf_mock_user", JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
