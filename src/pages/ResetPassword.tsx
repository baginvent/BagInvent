 import { useState, useEffect } from "react";
 import { useNavigate } from "react-router-dom";
 import { Store, Eye, EyeOff } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { supabase } from "@/integrations/supabase/client";
 import { toast } from "sonner";
 
 export default function ResetPassword() {
   const navigate = useNavigate();
   const [isLoading, setIsLoading] = useState(false);
   const [showPassword, setShowPassword] = useState(false);
   const [showConfirmPassword, setShowConfirmPassword] = useState(false);
   const [formData, setFormData] = useState({
     password: "",
     confirmPassword: "",
   });
 
   useEffect(() => {
     // Check if we have a valid session from the reset link
     const checkSession = async () => {
       const { data: { session } } = await supabase.auth.getSession();
       if (!session) {
         toast.error("Invalid or expired reset link");
         navigate("/auth");
       }
     };
     checkSession();
   }, [navigate]);
 
   const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     
     if (formData.password !== formData.confirmPassword) {
       toast.error("Passwords do not match");
       return;
     }
 
     if (formData.password.length < 6) {
       toast.error("Password must be at least 6 characters");
       return;
     }
 
     setIsLoading(true);
 
     try {
       const { error } = await supabase.auth.updateUser({
         password: formData.password,
       });
 
       if (error) throw error;
 
       toast.success("Password updated successfully!");
       navigate("/");
     } catch (error: unknown) {
       if (error instanceof Error) {
         toast.error(error.message);
       } else {
         toast.error("Failed to update password");
       }
     } finally {
       setIsLoading(false);
     }
   };
 
   return (
     <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
       {/* Logo */}
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
 
       {/* Form */}
       <div className="w-full max-w-md bg-[#2a2a2a] rounded-lg p-8">
         <h2 className="text-xl font-semibold text-foreground mb-2">Set new password</h2>
         <p className="text-sm text-muted-foreground mb-6">
           Enter your new password below.
         </p>
         <form onSubmit={handleSubmit} className="space-y-5">
           <div className="space-y-2">
             <Label htmlFor="password" className="text-muted-foreground text-sm">New Password</Label>
             <div className="relative">
               <Input
                 id="password"
                 type={showPassword ? "text" : "password"}
                 value={formData.password}
                 onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                 className="bg-[#e5e5e5] border-0 text-[#1a1a1a] h-11 pr-10"
                 placeholder="Enter new password"
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
             <Label htmlFor="confirmPassword" className="text-muted-foreground text-sm">Confirm Password</Label>
             <div className="relative">
               <Input
                 id="confirmPassword"
                 type={showConfirmPassword ? "text" : "password"}
                 value={formData.confirmPassword}
                 onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                 className="bg-[#e5e5e5] border-0 text-[#1a1a1a] h-11 pr-10"
                 placeholder="Confirm new password"
                 required
               />
               <button
                 type="button"
                 onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                 className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666]"
               >
                 {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
               </button>
             </div>
           </div>
 
           <Button
             type="submit"
             disabled={isLoading}
             className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 font-medium"
           >
             {isLoading ? "Updating..." : "Update password"}
           </Button>
         </form>
       </div>
     </div>
   );
 }