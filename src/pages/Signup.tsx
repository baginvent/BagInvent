import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  EMAIL_OTP_LENGTH,
  clearOtpSessionState,
  getOtpFunctionErrorMessage,
  getPendingOtpContext,
  markOtpRequested,
  setPendingOtpContext,
} from "@/lib/authOtp";

type Step = 1 | 2 | 3;

const passwordRequirements = "Use 8–24 characters with an uppercase letter, number, and special character.";
const isStrongPassword = (password: string) =>
  password.length >= 8 &&
  password.length <= 24 &&
  /[A-Z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9\s]/.test(password);

export default function Signup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [otpCode, setOtpCode] = useState("");
  const [otpUserId, setOtpUserId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const pendingOtpContext = getPendingOtpContext();

  const [formData, setFormData] = useState({
    companyName: "",
    email: pendingOtpContext.email,
    password: "",
    confirmPassword: "",
    phoneNumber: "",
    firstName: "",
    lastName: "",
  });

  const redirectTo = "/";
  const inputClassName =
    "h-11 rounded-none border-0 bg-[#e4e4e4] text-[#171717] shadow-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0";
  const secondaryInputClassName =
    "h-11 rounded-none border-0 bg-[#dedede] text-[#171717] shadow-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0";

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }

    const timer = setTimeout(() => setCountdown((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (!pendingOtpContext.email || !pendingOtpContext.userId) {
      return;
    }

    setOtpUserId(pendingOtpContext.userId);
    setStep(3);
  }, [pendingOtpContext.email, pendingOtpContext.userId]);

  const validatePasswordFields = () => {
    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return false;
    }

    if (!isStrongPassword(formData.password)) {
      toast.error(passwordRequirements);
      return false;
    }

    return true;
  };

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validatePasswordFields()) {
      return;
    }

    setStep(2);
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validatePasswordFields()) {
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            company_name: formData.companyName,
            first_name: formData.firstName,
            last_name: formData.lastName,
            phone_number: formData.phoneNumber,
          },
        },
      });

      if (error) {
        throw error;
      }

      if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
        throw new Error("This email is already registered. Please log in instead.");
      }

      if (data.session) {
        toast.success("Account created and signed in successfully.");
        navigate(redirectTo, { replace: true });
        return;
      }

      const userId = data.user?.id;

      if (!userId) {
        throw new Error("Account was created, but the verification flow could not start.");
      }

      setPendingOtpContext({
        email: formData.email,
        flow: "signup",
        redirectTo: "/",
        userId,
      });

      markOtpRequested(userId);
      setOtpUserId(userId);
      setOtpCode("");
      setCountdown(60);
      toast.success("Your account was created. Enter the verification code sent to your email.");
      setStep(3);
    } catch (error: unknown) {
      toast.error(await getOtpFunctionErrorMessage(error, "Failed to create account"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (otpCode.length !== EMAIL_OTP_LENGTH) {
      toast.error(`Please enter the full ${EMAIL_OTP_LENGTH}-digit code`);
      return;
    }

    if (!otpUserId) {
      toast.error("Your verification session has expired. Please sign up again.");
      setStep(1);
      return;
    }

    setIsVerifying(true);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: formData.email,
        token: otpCode,
        type: "email",
      });

      if (error) {
        throw error;
      }

      clearOtpSessionState(otpUserId);
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
    if (!otpUserId) {
      toast.error("Your verification session has expired. Please sign up again.");
      setStep(1);
      return;
    }

    setIsSendingCode(true);

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: formData.email,
      });

      if (error) {
        throw error;
      }

      markOtpRequested(otpUserId);
      setOtpCode("");
      setCountdown(60);
      toast.success("A new verification code was sent to your email.");
    } catch (error: unknown) {
      toast.error(await getOtpFunctionErrorMessage(error, "Failed to resend the code"));
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleUseAnotherAccount = () => {
    clearOtpSessionState(otpUserId);
    setOtpUserId("");
    setOtpCode("");
    setCountdown(0);
    setStep(1);
  };

  const stepEyebrow =
    step === 1
      ? "Sign up / Person Info"
      : step === 2
        ? "Sign up / Company Info"
        : "Sign up / Verify OTP";

  return (
    <AuthShell eyebrow={stepEyebrow} formWidthClassName="max-w-[500px]">
      <div className="bg-[#231f20] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)] sm:p-5">
        {step === 1 ? (
          <form onSubmit={handleStep1Submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-sm font-medium text-[#f4efe8]">
                  First Name
                </Label>
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className={inputClassName}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sm font-medium text-[#f4efe8]">
                  Last Name
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className={inputClassName}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-[#f4efe8]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={inputClassName}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-[#f4efe8]">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className={`${inputClassName} pr-10`}
                  minLength={8}
                  maxLength={24}
                  title={passwordRequirements}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-[#dad2ca]">{passwordRequirements}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium text-[#f4efe8]">
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({ ...formData, confirmPassword: e.target.value })
                  }
                  className={`${inputClassName} pr-10`}
                  minLength={8}
                  maxLength={24}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666]"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber" className="text-sm font-medium text-[#f4efe8]">
                Phone Number
              </Label>
              <Input
                id="phoneNumber"
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                className={inputClassName}
              />
            </div>

            <Button
              type="submit"
              className="mt-2 h-11 w-full rounded-none bg-primary font-medium text-white hover:bg-primary/90"
            >
              Proceed
            </Button>

            <div className="text-center text-sm text-[#f4efe8]">
              <Link to="/auth" className="transition-colors hover:text-white">
                Already have an account? Log in
              </Link>
            </div>
          </form>
        ) : step === 2 ? (
          <form onSubmit={handleStep2Submit} className="space-y-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="mb-2 flex items-center gap-2 text-sm text-[#f4efe8] transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-sm font-medium text-[#f4efe8]">
                Company Name
              </Label>
              <Input
                id="companyName"
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className={secondaryInputClassName}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="step2Email" className="text-sm font-medium text-[#f4efe8]">
                Email
              </Label>
              <Input
                id="step2Email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={secondaryInputClassName}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="step2Password" className="text-sm font-medium text-[#f4efe8]">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="step2Password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className={`${secondaryInputClassName} pr-10`}
                  minLength={8}
                  maxLength={24}
                  title={passwordRequirements}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-[#dad2ca]">{passwordRequirements}</p>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="step2ConfirmPassword"
                className="text-sm font-medium text-[#f4efe8]"
              >
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  id="step2ConfirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({ ...formData, confirmPassword: e.target.value })
                  }
                  className={`${secondaryInputClassName} pr-10`}
                  minLength={8}
                  maxLength={24}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666]"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="step2PhoneNumber" className="text-sm font-medium text-[#f4efe8]">
                Phone Number
              </Label>
              <Input
                id="step2PhoneNumber"
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                className={secondaryInputClassName}
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="mt-2 h-11 w-full rounded-none bg-primary font-medium text-white hover:bg-primary/90"
            >
              {isLoading ? "Creating account..." : "Sign up"}
            </Button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="mb-2 text-lg font-semibold text-[#f4efe8]">Verify Your New Account</h2>
              <p className="text-sm text-[#dad2ca]">
                Enter the {EMAIL_OTP_LENGTH}-digit code for{" "}
                <span className="font-medium text-white">{formData.email}</span>
              </p>
            </div>

            <div className="flex justify-center">
              <InputOTP maxLength={EMAIL_OTP_LENGTH} value={otpCode} onChange={setOtpCode}>
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
              disabled={isVerifying || isSendingCode || otpCode.length !== EMAIL_OTP_LENGTH}
              className="h-11 w-full rounded-none bg-primary font-medium text-white hover:bg-primary/90"
            >
              {isVerifying ? "Verifying..." : "Verify Account"}
            </Button>

            <div className="space-y-3 text-center">
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
                  Use another account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
