import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// UTC: F1-UTC02, F1-UTC04
// STC: STC-F1-01, STC-F1-02
import Login from "./page";
import { AuthProvider } from "@/contexts/AuthContext";

const { replace, toast } = vi.hoisted(() => ({ replace: vi.fn(), toast: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  motion: {
    div: ({ children, initial, animate, exit, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      <div {...props}>{children}</div>,
  },
}));
vi.mock("@/components/ui/input-otp", () => ({
  InputOTP: ({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) =>
    <input aria-label="Authenticator code" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />,
  InputOTPGroup: () => null,
  InputOTPSlot: () => null,
  InputOTPSeparator: () => null,
}));

function renderLogin() {
  return render(<React.StrictMode><AuthProvider><Login /></AuthProvider></React.StrictMode>);
}

describe("OAuth two-factor login", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/login#requires_2fa=1&temp_token=oauth-challenge");
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps the challenge out of storage and signs in only after verification", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      access_token: "verified-access-token",
      user: { id: "123", email: "member@example.com", display_name: "Member", is_2fa_enabled: true, has_password: false },
    }), { status: 200 }));
    renderLogin();
    expect(await screen.findByText("Two-Factor Authentication")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(localStorage.getItem("rf_token")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/2fa/verify"), expect.objectContaining({
      method: "POST", body: JSON.stringify({ temp_token: "oauth-challenge", code: "123456" }),
    }));
    expect(localStorage.getItem("rf_token")).toBe("verified-access-token");
  });

  it("keeps invalid or expired challenges unauthenticated and allows restarting login", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 401 }));
    renderLogin();
    fireEvent.change(await screen.findByLabelText("Authenticator code"), { target: { value: "000000" } });
    expect(await screen.findByText("Invalid authentication code. Please try again.")).toBeInTheDocument();
    expect(localStorage.getItem("rf_token")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Back to sign in"));
    expect(await screen.findByRole("button", { name: "Google" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Facebook" })).toBeEnabled();
  });

  it("rejects an incomplete callback instead of consuming an access token", async () => {
    window.history.replaceState({}, "", "/login?token=unexpected#requires_2fa=1");
    renderLogin();
    expect(await screen.findByText("Social login could not be completed. Please sign in again.")).toBeInTheDocument();
    expect(localStorage.getItem("rf_token")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
