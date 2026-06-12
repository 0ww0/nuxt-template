import { userRepository } from '../repositories/user.repository'
import { conflict, notFound } from '../utils/errors'

// SERVICE LAYER — business rules. HTTP-agnostic, SHARED across API versions.
export const userService = {
  list() {
    return userRepository.findAll()
  },

  async getById(id: number) {
    const user = await userRepository.findById(id)
    if (!user) throw notFound('User')
    return user
  },

  async register(input: { email: string; name: string }) {
    const existing = await userRepository.findByEmail(input.email)
    if (existing) throw conflict('Email already in use')
    return userRepository.create(input)
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