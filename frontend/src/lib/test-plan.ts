export const MAX_PROMPT_LENGTH = 500;
export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SECONDS = 60;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PASSWORD_CHECKS = [
  (password: string) => password.length >= 6,
  (password: string) => /[A-Z]/.test(password),
  (password: string) => /[a-z]/.test(password),
  (password: string) => /\d/.test(password),
  (password: string) => /[^A-Za-z0-9]/.test(password),
];

export type RegistrationForm = {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
};

export function validateRegistrationForm(form: RegistrationForm): string | null {
  if (!form.displayName.trim() || !form.email.trim() || !form.password) {
    return "Please fill in all fields";
  }
  if (!EMAIL_PATTERN.test(form.email.trim())) {
    return "Invalid email format";
  }
  if (!STRONG_PASSWORD_CHECKS.every((check) => check(form.password))) {
    return "Password must include uppercase, lowercase, number, and special character";
  }
  if (form.password !== form.confirmPassword) {
    return "Passwords do not match";
  }
  if (!form.acceptTerms) {
    return "Please accept the Terms and Privacy Policy";
  }
  return null;
}

export function validateLoginForm(email: string, password: string): string | null {
  if (!email.trim() || !password) return "Please fill in all fields";
  if (!EMAIL_PATTERN.test(email.trim())) return "Invalid email format";
  return null;
}

export function validateOtpCode(code: string): string | null {
  return /^\d{6}$/.test(code)
    ? null
    : "Please enter a 6-digit verification code";
}

export function validatePrompt(prompt: string): string | null {
  const normalized = prompt.trim();
  if (!normalized) return "Prompt text cannot be empty";
  if (normalized.length > MAX_PROMPT_LENGTH) {
    return `Prompt must not exceed ${MAX_PROMPT_LENGTH} characters`;
  }
  return null;
}

export function hasGuidedSelection(
  selections: Record<string, string | null | undefined>,
): boolean {
  return Object.values(selections).some((value) => Boolean(value?.trim()));
}

export function buildGuidedPromptPayload(
  selections: Record<string, string | null | undefined>,
  productId: string,
  duration: number,
) {
  return {
    mood: selections.mood || undefined,
    target: selections.target || undefined,
    style: selections.style || undefined,
    focus: selections.focus || undefined,
    lighting: selections.lighting || undefined,
    camera_motion: selections.cameraMotion || undefined,
    product_id: productId,
    duration,
  };
}

type FileDescriptor = {
  name: string;
  size: number;
};

function extension(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

export function validateProfileImage(file: FileDescriptor): string | null {
  if (![".jpg", ".jpeg", ".png"].includes(extension(file.name))) {
    return "Invalid file type. Allowed: JPG, PNG";
  }
  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    return "File is too large. Maximum size is 5MB.";
  }
  return null;
}

export function validateVideoFile(
  file: FileDescriptor,
  durationSeconds?: number,
): string | null {
  if (![".mp4", ".mov", ".avi"].includes(extension(file.name))) {
    return "Unsupported video format. Allowed: MP4, MOV, AVI";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return "Video file size exceeds the 500MB limit";
  }
  if (
    durationSeconds !== undefined
    && durationSeconds > MAX_VIDEO_DURATION_SECONDS
  ) {
    return "Video duration exceeds the 60-second limit";
  }
  return null;
}

export function validateProductImages(files: FileDescriptor[]): string | null {
  if (files.length > 5) return "Maximum 5 images allowed per product";
  if (
    files.some(
      (file) => ![".jpg", ".jpeg", ".png", ".webp"].includes(extension(file.name)),
    )
  ) {
    return "Product images must use JPG, PNG, or WEBP format";
  }
  return null;
}

export type ProductCompleteness = {
  productName: string;
  description?: string | null;
  affiliateLink?: string | null;
  imageCount: number;
};

export function getProductStatus(product: ProductCompleteness): "Active" | "Draft" {
  return product.productName.trim()
    && product.description?.trim()
    && product.affiliateLink?.trim()
    && product.imageCount > 0
    ? "Active"
    : "Draft";
}

export type SortKey = "newest" | "oldest" | "updated" | "name";

export function sortLibraryItems<
  T extends { name: string; createdAt: string; updatedAt: string },
>(items: T[], key: SortKey): T[] {
  const result = [...items];
  switch (key) {
    case "newest":
      return result.sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      );
    case "oldest":
      return result.sort(
        (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
      );
    case "updated":
      return result.sort(
        (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt),
      );
    case "name":
      return result.sort((a, b) => a.name.localeCompare(b.name));
  }
}
