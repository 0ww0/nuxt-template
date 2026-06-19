import { userRepository } from '../repositories/user.repository'
import { conflict, notFound } from '../utils/errors'

// SERVICE LAYER — business rules. HTTP-agnostic, SHARED across API versions.
//
// NOTE: user creation (registration) is intentionally NOT here. All paths that
// create a user — public self-sign-up and admin provisioning — go through
// authService.register, which is the only place that hashes passwords. This
// avoids the footgun of a no-password user being created with a null passwordHash.
export const userService = {
  list() {
    return userRepository.findAll()
  },

  async getById(id: number) {
    const user = await userRepository.findById(id)
    if (!user) throw notFound('User')
    return user
  },

  async update(id: number, input: { email?: string; name?: string }) {
    await this.getById(id) // 404 if missing
    if (input.email) {
      const owner = await userRepository.findByEmail(input.email)
      if (owner && owner.id !== id) throw conflict('Email already in use')
    }
    return userRepository.update(id, input)
  },

  async remove(id: number) {
    const ok = await userRepository.delete(id)
    if (!ok) throw notFound('User')
  },
}