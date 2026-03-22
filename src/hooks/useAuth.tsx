 import { useEffect, useState } from "react";
 import { User, Session } from "@supabase/supabase-js";
 import { supabase } from "@/integrations/supabase/client";
 import { clearOtpSessionState } from "@/lib/authOtp";
 
 interface Profile {
   id: string;
   user_id: string;
   company_name: string;
   first_name: string | null;
   last_name: string | null;
   phone_number: string | null;
 }
 
 export function useAuth() {
   const [user, setUser] = useState<User | null>(null);
   const [session, setSession] = useState<Session | null>(null);
   const [profile, setProfile] = useState<Profile | null>(null);
   const [loading, setLoading] = useState(true);
 
   useEffect(() => {
     // Set up auth state listener FIRST
     const { data: { subscription } } = supabase.auth.onAuthStateChange(
       async (event, session) => {
         setSession(session);
         setUser(session?.user ?? null);
         
         if (session?.user) {
           // Fetch profile after auth state change
           setTimeout(async () => {
             const { data } = await supabase
               .from("profiles")
               .select("*")
               .eq("user_id", session.user.id)
               .maybeSingle();
             setProfile(data);
           }, 0);
         } else {
           setProfile(null);
           clearOtpSessionState();
         }
         
         setLoading(false);
       }
     );
 
     // Then get initial session
     supabase.auth.getSession().then(({ data: { session } }) => {
       setSession(session);
       setUser(session?.user ?? null);
       
       if (session?.user) {
         supabase
           .from("profiles")
           .select("*")
           .eq("user_id", session.user.id)
           .maybeSingle()
           .then(({ data }) => {
             setProfile(data);
             setLoading(false);
           });
       } else {
         clearOtpSessionState();
         setLoading(false);
       }
     });
 
     return () => {
       subscription.unsubscribe();
     };
   }, []);
 
   const signOut = async () => {
     clearOtpSessionState(user?.id);
     await supabase.auth.signOut();
   };
 
   return { user, session, profile, loading, signOut };
 }
