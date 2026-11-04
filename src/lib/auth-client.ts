"use client";

import { createAuthClient } from "better-auth/react";
import {
  adminClient,
  emailOTPClient,
  inferAdditionalFields,
  jwtClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    emailOTPClient(),
    inferAdditionalFields<typeof auth>(),
    jwtClient(),
    twoFactorClient({ twoFactorPage: "/two-factor/verify" }),
  ],
});
