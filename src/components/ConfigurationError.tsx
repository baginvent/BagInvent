import { AlertTriangle } from "lucide-react";
import { supabaseConfigurationMessage } from "@/integrations/supabase/client";

export function ConfigurationError() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-destructive/30 bg-card p-8 shadow-2xl shadow-black/30">
        <div className="mb-6 flex items-center gap-3 text-destructive">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Deployment configuration needed</h1>
            <p className="text-sm text-muted-foreground">
              The app loaded, but it cannot start without its Supabase settings.
            </p>
          </div>
        </div>

        <p className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
          {supabaseConfigurationMessage}
        </p>

        <div className="mt-6 space-y-4 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">Add these exact variables in Vercel:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <code>VITE_SUPABASE_URL</code>
              </li>
              <li>
                <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
              </li>
            </ul>
          </div>

          <p>
            After adding them in Project Settings - Environment Variables, redeploy the app so Vite can bake the
            values into the production bundle.
          </p>
        </div>
      </div>
    </div>
  );
}
