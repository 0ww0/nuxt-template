import { z } from 'zod'

// v1 AUTH INPUT CONTRACTS — shared by client (form validation) and server.
// NOTE: register intentionally does NOT accept `role`. Role is server-assigned
// (defaults to 'user'); never let a client self-promote to 'admin' via the body.
//
// CHANGED: email inputs are normalized with .toLowerCase().trim() so the
// case-sensitive unique constraint can't be bypassed (Ada@x.com vs ada@x.com)
// and so login matches a normalized stored value.
export const loginV1Schema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(8).max(200),
})

export const registerV1Schema = z.object({
  email: z.string().email().toLowerCase().trim(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
})

// Step 1 of reset: just an email. Response is intentionally generic (see handler).
export const forgotPasswordV1Schema = z.object({
  email: z.string().email().toLowerCase().trim(),
})

// Step 2 of reset: the emailed token + the new password (same rules as register).
export const resetPasswordV1Schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
})

// Email verification: confirm ownership of the address via the emailed token.
export const verifyEmailV1Schema = z.object({
  token: z.string().min(1),
})

export type LoginV1 = z.infer<typeof loginV1Schema>
export type RegisterV1 = z.infer<typeof registerV1Schema>
export type ForgotPasswordV1 = z.infer<typeof forgotPasswordV1Schema>
export type ResetPasswordV1 = z.infer<typeof resetPasswordV1Schema>
export type VerifyEmailV1 = z.infer<typeof verifyEmailV1Schema>
