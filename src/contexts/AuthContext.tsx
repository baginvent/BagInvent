 import { createContext, useContext, ReactNode } from "react";
 import { User, Session } from "@supabase/supabase-js";
 import { useAuth } from "@/hooks/useAuth";
 
 interface Profile {
   id: string;
   user_id: string;
   company_name: string;
   first_name: string | null;
   last_name: string | null;
   phone_number: string | null;
 }
 
 interface AuthContextType {
   user: User | null;
   session: Session | null;
   profile: Profile | null;
   loading: boolean;
   signOut: () => Promise<void>;
 }
 
 const AuthContext = createContext<AuthContextType | undefined>(undefined);
 
 export function AuthProvider({ children }: { children: ReactNode }) {
   const auth = useAuth();
   
   return (
     <AuthContext.Provider value={auth}>
       {children}
     </AuthContext.Provider>
   );
 }
 
 export function useAuthContext() {
   const context = useContext(AuthContext);
   if (context === undefined) {
     throw new Error("useAuthContext must be used within an AuthProvider");
   }
   return context;
 }