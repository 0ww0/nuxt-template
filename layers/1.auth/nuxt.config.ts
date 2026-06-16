// Marks this directory as a Nuxt layer. It is auto-registered because it lives
// under layers/ (no `extends` needed). The numeric prefix `1.` gives it the
// lowest override priority, so feature/role layers (2.*, 3.*) build on top.
export default defineNuxtConfig({})
