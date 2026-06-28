// server/services/user.service.ts
// Business rules for User management. HTTP-agnostic — never import `event` or status codes.
// DB access via user.repository.ts only.
// Throws: notFound / conflict / forbidden from server/utils/errors.ts.
// See also: auth.service.ts (user creation via register — intentionally NOT here).
//
// NOTE: user creation (registration) is intentionally NOT here. All paths that
// create a user — public self-sign-up and admin provisioning — go through
// authService.register, which is the only place that hashes passwords. This
// avoids the footgun of a no-password user being created with a null passwordHash.
//
// Role mutation and deletion are actor-aware: the handler resolves the actor at
// the edge and passes it in, so the rank rules below can't be bypassed.
import { userRepository } from '../repositories/user.repository'
import { conflict, forbidden, notFound } from '../utils/errors'
import { ROLE_RANK, roleAtLeast, type UserRole } from '../../shared/auth/roles'
import type { User } from '../db/schema'

export const userService = {
  list() {
    return userRepository.findAll()
  },

  // Generic capability: list users excluding the given roles. The DECISION of
  // which roles to hide is the caller's (the v2 list handler excludes
  // 'admin'/'super_admin') — keeping the policy at the edge so this method stays
  // reusable and the service stays version-agnostic.
  listExcludingRoles(roles: UserRole[]) {
    return userRepository.findAllExcludingRoles(roles)
  },

  async getById(id: number) {
    const user = await userRepository.findById(id)
    if (!user) throw notFound('User')
    return user
  },

  // Profile-only update (email/name). `role` is not part of UpdateUserV1 and the
  // schema is `.strict()`, so it can't arrive here — role changes go through
  // setRole. Email uniqueness is pre-checked; the repo's 23505 guard covers races.
  async update(id: number, input: { email?: string; name?: string }) {
    await this.getById(id) // 404 if missing
    if (input.email) {
      const owner = await userRepository.findByEmail(input.email)
      if (owner && owner.id !== id) throw conflict('Email already in use')
    }
    return userRepository.update(id, input)
  },

  // Change a target user's role. Enforces, independent of the edge gate:
  //  - no self-role-change (an actor can't promote/demote themselves)
  //  - can't assign a role above the actor's own rank
  //  - can't modify a user who outranks the actor
  //  - can't demote the LAST super_admin (would strand the system)
  // The route gates this at super_admin; the checks below are defense-in-depth
  // and keep the method correct if that gate is ever loosened.
  async setRole(actor: User, targetId: number, newRole: UserRole) {
    const target = await userRepository.findById(targetId)
    if (!target) throw notFound('User')

    if (target.id === actor.id) {
      throw forbidden('You cannot change your own role')
    }
    if (!roleAtLeast(actor.role, newRole)) {
      throw forbidden('Cannot assign a role above your own')
    }
    if (!roleAtLeast(actor.role, target.role)) {
      throw forbidden('Cannot modify a higher-privileged user')
    }

    const isDemotion = target.role === 'super_admin' && newRole !== 'super_admin'
    if (isDemotion) {
      const remaining = await userRepository.countByRole('super_admin')
      if (remaining <= 1) throw conflict('Cannot demote the last super_admin')
    }

    return userRepository.setRole(targetId, newRole)
  },

  // Delete a target user. An actor may only delete accounts they STRICTLY
  // outrank, and never themselves:
  //  - admin       → can delete users, but not admins or super_admins
  //  - super_admin → can delete users and admins, but not another super_admin
  // (Super_admins are therefore un-deletable via the API by design; remove at the
  // DB/seeder level if ever truly required.)
  async remove(actor: User, targetId: number) {
    const target = await userRepository.findById(targetId)
    if (!target) throw notFound('User')

    if (target.id === actor.id) {
      throw forbidden('You cannot delete your own account')
    }
    if (ROLE_RANK[actor.role] <= ROLE_RANK[target.role]) {
      throw forbidden('Cannot delete a user at or above your own rank')
    }

    await userRepository.delete(targetId)
  },
}
