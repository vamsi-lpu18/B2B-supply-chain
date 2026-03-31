import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (totalPages() > 1) {
      <div class="pagination">
        <button [disabled]="currentPage() === 1" (click)="go(currentPage() - 1)">‹</button>
        @for (p of pages(); track p) {
          <button [class.active]="p === currentPage()" (click)="go(p)">{{ p }}</button>
        }
        <button [disabled]="currentPage() === totalPages()" (click)="go(currentPage() + 1)">›</button>
      </div>
    }
  `
})
export class PaginationComponent {
  readonly currentPage = input.required<number>();
  readonly totalCount  = input.required<number>();
  readonly pageSize    = input(20);
  readonly pageChange  = output<number>();

  readonly totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize()));

  readonly pages = computed(() => {
    const total = this.totalPages();
    const cur   = this.currentPage();
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, cur - delta); i <= Math.min(total, cur + delta); i++) {
      range.push(i);
    }
    return range;
  });

  go(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.pageChange.emit(page);
    }
  }
}
