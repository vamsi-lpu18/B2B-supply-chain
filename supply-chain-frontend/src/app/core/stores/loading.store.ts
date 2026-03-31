import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingStore {
  private readonly _count = signal(0);
  readonly isLoading = computed(() => this._count() > 0);

  increment(): void { this._count.update(n => n + 1); }
  decrement(): void { this._count.update(n => Math.max(0, n - 1)); }
}
