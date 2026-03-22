import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Store, Eye, EyeOff, ArrowLeft } from "lucide-react";
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

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setStep(2);
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        {step === 1 ? (
          <form onSubmit={handleStep1Submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-muted-foreground text-sm">
                Company Name
              </Label>
              <Input
                id="companyName"
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="bg-[#e5e5e5] border-0 text-[#1a1a1a] h-11"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground text-sm">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-[#e5e5e5] border-0 text-[#1a1a1a] h-11"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground text-sm">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="bg-[#e5e5e5] border-0 text-[#1a1a1a] h-11 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-muted-foreground text-sm">
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="bg-[#e5e5e5] border-0 text-[#1a1a1a] h-11 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666]"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber" className="text-muted-foreground text-sm">
                Phone Number
              </Label>
              <Input
                id="phoneNumber"
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                className="bg-[#e5e5e5] border-0 text-[#1a1a1a] h-11"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 font-medium mt-2"
            >
              Continue
            </Button>

            <div className="text-center mt-4">
              <Link
                to="/auth"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Already have an account? Log in
              </Link>
            </div>
          </form>
        ) : step === 2 ? (
          <form onSubmit={handleStep2Submit} className="space-y-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-muted-foreground text-sm">
                  First Name
                </Label>
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="bg-[#e5e5e5] border-0 text-[#1a1a1a] h-11"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-muted-foreground text-sm">
                  Last Name
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="bg-[#e5e5e5] border-0 text-[#1a1a1a] h-11"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Email</Label>
              <Input
                type="email"
                value={formData.email}
                disabled
                className="bg-[#3a3a3a] border-0 text-muted-foreground h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Password</Label>
              <Input
                type="password"
                value="********"
                disabled
                className="bg-[#3a3a3a] border-0 text-muted-foreground h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Confirm Password</Label>
              <Input
                type="password"
                value="********"
                disabled
                className="bg-[#3a3a3a] border-0 text-muted-foreground h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Phone Number</Label>
              <Input
                type="tel"
                value={formData.phoneNumber}
                disabled
                className="bg-[#3a3a3a] border-0 text-muted-foreground h-11"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 font-medium mt-2"
            >
              {isLoading ? "Creating account..." : "Create Account and Send OTP"}
            </Button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-foreground mb-2">Verify Your New Account</h2>
              <p className="text-sm text-muted-foreground">
                Enter the {EMAIL_OTP_LENGTH}-digit code for{" "}
                <span className="text-foreground font-medium">{formData.email}</span>
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
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 font-medium"
            >
              {isVerifying ? "Verifying..." : "Verify Account"}
            </Button>

            <div className="text-center space-y-3">
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
                  Use another account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
