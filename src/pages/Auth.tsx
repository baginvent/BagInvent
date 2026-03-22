import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Store, Eye, EyeOff } from "lucide-react";
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
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground">Email Authentication</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Enter your email and password to access your dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 font-medium"
          >
            {isLoading ? "Signing in..." : "Log In"}
          </Button>
        </form>

        <div className="flex justify-between mt-6">
          <Link
            to="/forgot-password"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Forgot password?
          </Link>
          <Link
            to="/signup"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
