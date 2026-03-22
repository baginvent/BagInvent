import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Store } from "lucide-react";
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
          <Store className="w-7 h-7 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-primary">BAG-INVENT</h1>
          <p className="text-xs text-muted-foreground">AI-Powered</p>
          <p className="text-xs text-muted-foreground">Inventory Management</p>
        </div>
      </div>

      <div className="w-full max-w-md bg-[#2a2a2a] rounded-lg p-8">
        <div className="text-center mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-2">Verify Your New Account</h2>
          <p className="text-sm text-muted-foreground">
            Enter the {EMAIL_OTP_LENGTH}-digit code sent to{" "}
            <span className="text-foreground font-medium">{email}</span>
          </p>
        </div>

        <div className="flex justify-center mb-6">
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
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 font-medium"
        >
          {isVerifying ? "Verifying..." : "Verify Account"}
        </Button>

        <div className="text-center mt-4 space-y-3">
          <button
            onClick={handleResend}
            disabled={isSendingCode || countdown > 0}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
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
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to log in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
