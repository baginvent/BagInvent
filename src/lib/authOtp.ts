export type OtpFlow = "signup";

export type PendingOtpContext = {
  email: string;
  flow: OtpFlow;
  redirectTo: string;
  userId: string;
};

export const EMAIL_OTP_LENGTH = 8;

const PENDING_OTP_EMAIL_KEY = "pending_otp_email";
const PENDING_OTP_FLOW_KEY = "pending_otp_flow";
const PENDING_OTP_REDIRECT_KEY = "pending_otp_redirect";
const PENDING_OTP_USER_ID_KEY = "pending_otp_user_id";

const canUseSessionStorage = () =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

const getSessionStorage = () => (canUseSessionStorage() ? window.sessionStorage : null);

export const getOtpRequestedKey = (userId: string) => `otp_requested_${userId}`;

export const hasRequestedOtp = (userId?: string | null) => {
  if (!userId) {
    return false;
  }

  return getSessionStorage()?.getItem(getOtpRequestedKey(userId)) === "true";
};

export const markOtpRequested = (userId: string) => {
  getSessionStorage()?.setItem(getOtpRequestedKey(userId), "true");
};

export const clearOtpRequested = (userId?: string | null) => {
  if (!userId) {
    return;
  }

  getSessionStorage()?.removeItem(getOtpRequestedKey(userId));
};

export const setPendingOtpContext = (context: PendingOtpContext) => {
  const storage = getSessionStorage();

  if (!storage) {
    return;
  }

  storage.setItem(PENDING_OTP_EMAIL_KEY, context.email);
  storage.setItem(PENDING_OTP_FLOW_KEY, context.flow);
  storage.setItem(PENDING_OTP_REDIRECT_KEY, context.redirectTo);
  storage.setItem(PENDING_OTP_USER_ID_KEY, context.userId);
};

export const getPendingOtpContext = (): PendingOtpContext => {
  const storage = getSessionStorage();

  return {
    email: storage?.getItem(PENDING_OTP_EMAIL_KEY) ?? "",
    flow: "signup",
    redirectTo: storage?.getItem(PENDING_OTP_REDIRECT_KEY) ?? "/",
    userId: storage?.getItem(PENDING_OTP_USER_ID_KEY) ?? "",
  };
};

export const clearPendingOtpContext = () => {
  const storage = getSessionStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(PENDING_OTP_EMAIL_KEY);
  storage.removeItem(PENDING_OTP_FLOW_KEY);
  storage.removeItem(PENDING_OTP_REDIRECT_KEY);
  storage.removeItem(PENDING_OTP_USER_ID_KEY);
};

export const clearOtpSessionState = (userId?: string | null) => {
  clearOtpRequested(userId);
  clearPendingOtpContext();
};

const getHttpErrorMessage = async (error: Error & { context?: unknown }) => {
  if (error.name !== "FunctionsHttpError" || !(error.context instanceof Response)) {
    return null;
  }

  try {
    const response = error.context.clone();
    const contentType = response.headers.get("Content-Type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await response.json()) as { error?: unknown; message?: unknown };

      if (typeof body.error === "string" && body.error.trim()) {
        return body.error;
      }

      if (typeof body.message === "string" && body.message.trim()) {
        return body.message;
      }
    }

    const text = await response.text();
    return text.trim() || null;
  } catch {
    return null;
  }
};

export const getOtpFunctionErrorMessage = async (
  error: unknown,
  fallbackMessage: string,
) => {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (
      message.includes("failed to send a request to the edge function") ||
      message.includes("failed to fetch")
    ) {
      return "The OTP authentication service is not reachable. Check your Supabase Auth configuration and try again.";
    }

    const httpMessage = await getHttpErrorMessage(error);
    if (httpMessage) {
      return httpMessage;
    }

    return error.message;
  }

  return fallbackMessage;
};
