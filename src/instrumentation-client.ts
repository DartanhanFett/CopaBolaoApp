// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { createClient } from "../lib/supabase/client";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  integrations: [Sentry.replayIntegration()],
});

// Integrate Supabase auth state with Sentry user context
const supabase = createClient();

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    Sentry.setUser({
      id: session.user.id,
      email: session.user.email,
    });
  } else {
    Sentry.setUser(null);
  }
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;