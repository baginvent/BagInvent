 import { useState } from "react";
 import { Link } from "react-router-dom";
 import { Store, ArrowLeft } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { supabase } from "@/integrations/supabase/client";
 import { toast } from "sonner";
 
 export default function ForgotPassword() {
   const [isLoading, setIsLoading] = useState(false);
   const [email, setEmail] = useState("");
   const [emailSent, setEmailSent] = useState(false);
 
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
         {emailSent ? (
           <div className="text-center space-y-4">
             <h2 className="text-xl font-semibold text-foreground">Check your email</h2>
             <p className="text-muted-foreground">
               We've sent a password reset link to <strong>{email}</strong>
             </p>
             <p className="text-sm text-muted-foreground">
               Didn't receive the email? Check your spam folder or try again.
             </p>
             <Button
               variant="outline"
               onClick={() => setEmailSent(false)}
               className="mt-4"
             >
               Try again
             </Button>
           </div>
         ) : (
           <>
             <h2 className="text-xl font-semibold text-foreground mb-2">Forgot password?</h2>
             <p className="text-sm text-muted-foreground mb-6">
               Enter your email address and we'll send you a link to reset your password.
             </p>
             <form onSubmit={handleSubmit} className="space-y-5">
               <div className="space-y-2">
                 <Label htmlFor="email" className="text-muted-foreground text-sm">Email</Label>
                 <Input
                   id="email"
                   type="email"
                   value={email}
                   onChange={(e) => setEmail(e.target.value)}
                   className="bg-[#e5e5e5] border-0 text-[#1a1a1a] h-11"
                   placeholder="Enter your email"
                   required
                 />
               </div>
 
               <Button
                 type="submit"
                 disabled={isLoading}
                 className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 font-medium"
               >
                 {isLoading ? "Sending..." : "Send reset link"}
               </Button>
             </form>
           </>
         )}
 
         <Link
           to="/auth"
           className="flex items-center gap-2 justify-center mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
         >
           <ArrowLeft className="w-4 h-4" />
           Back to login
         </Link>
       </div>
     </div>
   );
 }