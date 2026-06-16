import { z } from 'zod'

// v1 AUTH INPUT CONTRACTS — shared by client (form validation) and server.
// NOTE: register intentionally does NOT accept `role`. Role is server-assigned
// (defaults to 'user'); never let a client self-promote to 'admin' via the body.
export const loginV1Schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
})

export const registerV1Schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
})

export type LoginV1 = z.infer<typeof loginV1Schema>
export type RegisterV1 = z.infer<typeof registerV1Schema>
