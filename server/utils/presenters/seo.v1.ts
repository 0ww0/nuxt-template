import type { SeoSettings } from '../../db/schema'

// v1 PRESENTER for the singleton `seo_settings` record. Small record, but
// spread to stay consistent with the other settings singletons and avoid
// hand-listing fields that will likely grow (e.g. structured data, robots
// directives).
export function presentSeoV1(seo: SeoSettings) {
  return {
    ...seo,
    createdAt: seo.createdAt.toISOString(),
    updatedAt: seo.updatedAt.toISOString(),
  }
}
