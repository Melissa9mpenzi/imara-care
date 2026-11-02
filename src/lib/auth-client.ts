"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient, jwtClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    jwtClient(),
    twoFactorClient({ twoFactorPage: "/two-factor/verify" }),
  ],
});
