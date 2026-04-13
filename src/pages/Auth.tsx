import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { clearOtpSessionState } from "@/lib/authOtp";

export default function Auth() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const inputClassName =
    "h-11 rounded-none border-0 bg-[#e4e4e4] text-[#171717] shadow-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) {
        throw error;
      }

      if (!data.user?.email) {
        throw new Error("This account does not have a valid email address.");
      }

      clearOtpSessionState(data.user.id);
      toast.success("Signed in successfully.");
      navigate("/", { replace: true });
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Failed to sign in");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell eyebrow="Log in" formWidthClassName="max-w-[460px]">
      <div className="bg-[#231f20] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)] sm:p-5">
        <form onSubmit={handleSubmit} className="space-y-5">
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
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="h-11 w-full rounded-none bg-primary font-medium text-white hover:bg-primary/90"
          >
            {isLoading ? "Signing in..." : "Log in"}
          </Button>
        </form>

        <div className="mt-5 flex items-center justify-between gap-3 text-sm text-[#f4efe8]">
          <Link to="/forgot-password" className="transition-colors hover:text-white">
            Forgot password?
          </Link>
          <Link to="/signup" className="transition-colors hover:text-white">
            Sign up
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
