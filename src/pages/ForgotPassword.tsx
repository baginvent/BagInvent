import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const inputClassName =
    "h-11 rounded-none border-0 bg-[#e4e4e4] text-[#171717] shadow-none focus-visible:ring-1 focus-visible:ring-[#cf5a5a] focus-visible:ring-offset-0";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setEmailSent(true);
      toast.success("Password reset email sent!");
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Failed to send reset email");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell eyebrow="Forgot password" formWidthClassName="max-w-[460px]">
      <div className="bg-[#231f20] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)] sm:p-5">
        {emailSent ? (
          <div className="space-y-4 text-center">
            <h2 className="text-xl font-semibold text-[#f4efe8]">Check your email</h2>
            <p className="text-sm text-[#dad2ca]">
              We&apos;ve sent a password reset link to <strong className="text-white">{email}</strong>
            </p>
            <p className="text-sm text-[#dad2ca]">
              Didn&apos;t receive it yet? Check your spam folder or send another one.
            </p>
            <Button
              variant="outline"
              onClick={() => setEmailSent(false)}
              className="mx-auto h-11 rounded-none border-0 bg-[#e4e4e4] px-6 text-[#171717] hover:bg-[#dadada] hover:text-[#171717]"
            >
              Try again
            </Button>
          </div>
        ) : (
          <>
            <p className="mb-6 text-sm text-[#dad2ca]">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-[#f4efe8]">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClassName}
                  placeholder="Enter your email"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="h-11 w-full rounded-none bg-[#cf5a5a] font-medium text-white hover:bg-[#c55252]"
              >
                {isLoading ? "Sending..." : "Send reset link"}
              </Button>
            </form>
          </>
        )}

        <Link
          to="/auth"
          className="mt-6 flex items-center justify-center gap-2 text-sm text-[#dad2ca] transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>
      </div>
    </AuthShell>
  );
}
