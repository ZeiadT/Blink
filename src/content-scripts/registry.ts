// ── Platform Adapter Registry ────────────────────────────────────────────
// Maps platform IDs to adapter factories. Designed for future expansion
// (LinkedIn, Reddit) without touching orchestrator code.

import type { PlatformAdapter } from '@shared/types';
import { FacebookAdapter } from './facebook/adapter';

export class PlatformRegistry {
  private adapters = new Map<string, () => PlatformAdapter>();

  /**
   * Register an adapter factory for a platform.
   */
  register(platformId: string, factory: () => PlatformAdapter): void {
    this.adapters.set(platformId, factory);
  }

  /**
   * Get an adapter instance for a given URL.
   * Iterates registered adapters and calls isValidGroupUrl on each.
   */
  getAdapterForUrl(url: string): PlatformAdapter | null {
    for (const factory of this.adapters.values()) {
      const adapter = factory();
      if (adapter.isValidGroupUrl(url)) {
        return adapter;
      }
    }
    return null;
  }

  /**
   * Get an adapter by platform ID.
   */
  getAdapter(platformId: string): PlatformAdapter | null {
    const factory = this.adapters.get(platformId);
    return factory ? factory() : null;
  }

  /**
   * List all registered platform IDs.
   */
  get registeredPlatforms(): string[] {
    return Array.from(this.adapters.keys());
  }
}

// ── Singleton with Facebook pre-registered ───────────────────────────────

const registry = new PlatformRegistry();
registry.register('facebook', () => new FacebookAdapter());

export default registry;
