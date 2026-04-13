import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  EMAIL_OTP_LENGTH,
  clearOtpRequested,
  clearOtpSessionState,
  clearPendingOtpContext,
  getOtpFunctionErrorMessage,
  getPendingOtpContext,
  hasRequestedOtp,
  markOtpRequested,
  setPendingOtpContext,
  type OtpFlow,
} from "@/lib/authOtp";

type VerifyOtpLocationState = {
  email?: string;
  redirectTo?: string;
  userId?: string;
};

export default function VerifyOTP() {
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const locationState = (location.state as VerifyOtpLocationState | null) ?? null;
  const pendingOtpContext = getPendingOtpContext();
  const flow: OtpFlow = "signup";
  const email = locationState?.email ?? pendingOtpContext.email ?? "";
  const redirectTo = locationState?.redirectTo ?? pendingOtpContext.redirectTo ?? "/";
  const userId = locationState?.userId ?? pendingOtpContext.userId ?? "";

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  useEffect(() => {
    if (!email || !userId) {
      clearPendingOtpContext();
      navigate("/auth", { replace: true });
      return;
    }

    setPendingOtpContext({ email, flow, redirectTo, userId });
  }, [email, flow, navigate, redirectTo, userId]);

  useEffect(() => {
    if (!email || !userId || hasRequestedOtp(userId)) {
      return;
    }

    let active = true;

    const sendInitialCode = async () => {
      setIsSendingCode(true);

      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });

      if (!active) {
        return;
      }

      if (error) {
        toast.error(
          await getOtpFunctionErrorMessage(error, "Failed to send your verification code."),
        );
      } else {
        markOtpRequested(userId);
        setCountdown(60);
        toast.success(
          `An ${EMAIL_OTP_LENGTH}-digit account verification code was sent to your email.`,
        );
      }

      setIsSendingCode(false);
    };

    void sendInitialCode();

    return () => {
      active = false;
    };
  }, [email, flow, userId]);

  const handleVerify = async () => {
    if (code.length !== EMAIL_OTP_LENGTH) {
      toast.error(`Please enter the full ${EMAIL_OTP_LENGTH}-digit code`);
      return;
    }

    if (!email || !userId) {
      toast.error("Your verification session has expired. Please try again.");
      navigate("/auth", { replace: true });
      return;
    }

    setIsVerifying(true);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });

      if (error) {
        throw error;
      }

      clearOtpRequested(userId);
      clearPendingOtpContext();

      if (data.session) {
        toast.success("Account verified and signed in successfully.");
        navigate(redirectTo, { replace: true });
        return;
      }

      toast.success("Account verified. You can now log in.");
      navigate("/auth", { replace: true });
    } catch (error: unknown) {
      toast.error(
        await getOtpFunctionErrorMessage(error, "Verification failed. Please try again."),
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email || !userId) {
      toast.error("Your verification session has expired. Please try again.");
      navigate("/auth", { replace: true });
      return;
    }

    setIsSendingCode(true);

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });

      if (error) {
        throw error;
      }

      markOtpRequested(userId);
      setCode("");
      setCountdown(60);
      toast.success("A new verification code was sent to your email.");
    } catch (error: unknown) {
      toast.error(await getOtpFunctionErrorMessage(error, "Failed to resend the code"));
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleUseAnotherAccount = () => {
    clearOtpSessionState(userId);
    navigate("/auth", { replace: true });
  };

  if (!email || !userId) {
    return null;
  }

  return (
    <AuthShell eyebrow="Verify OTP" formWidthClassName="max-w-[460px]">
      <div className="bg-[#231f20] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)] sm:p-5">
        <div className="mb-6 text-center">
          <h2 className="mb-2 text-lg font-semibold text-[#f4efe8]">Verify Your New Account</h2>
          <p className="text-sm text-[#dad2ca]">
            Enter the {EMAIL_OTP_LENGTH}-digit code sent to{" "}
            <span className="font-medium text-white">{email}</span>
          </p>
        </div>

        <div className="mb-6 flex justify-center">
          <InputOTP maxLength={EMAIL_OTP_LENGTH} value={code} onChange={setCode}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
              <InputOTPSlot index={6} />
              <InputOTPSlot index={7} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button
          onClick={handleVerify}
          disabled={isVerifying || isSendingCode || code.length !== EMAIL_OTP_LENGTH}
          className="h-11 w-full rounded-none bg-primary font-medium text-white hover:bg-primary/90"
        >
          {isVerifying ? "Verifying..." : "Verify Account"}
        </Button>

        <div className="mt-4 space-y-3 text-center">
          <button
            onClick={handleResend}
            disabled={isSendingCode || countdown > 0}
            className="text-sm text-[#dad2ca] transition-colors hover:text-white disabled:opacity-50"
          >
            {isSendingCode
              ? "Sending code..."
              : countdown > 0
                ? `Resend code in ${countdown}s`
                : "Resend code"}
          </button>
          <div>
            <button
              onClick={handleUseAnotherAccount}
              className="text-sm text-[#dad2ca] transition-colors hover:text-white"
            >
              Back to log in
            </button>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
