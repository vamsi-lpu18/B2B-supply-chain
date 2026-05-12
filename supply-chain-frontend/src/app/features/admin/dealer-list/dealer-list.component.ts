import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { AdminApiService } from '../../../core/api/admin-api.service';
import { DealerSummaryDto } from '../../../core/models/auth.models';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-dealer-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, PaginationComponent],
  templateUrl: './dealer-list.component.html'
})
export class DealerListComponent implements OnInit {
  private readonly adminApi = inject(AdminApiService);

  readonly loading    = signal(true);
  readonly dealers    = signal<DealerSummaryDto[]>([]);
  readonly page       = signal(1);
  readonly totalCount = signal(0);

  searchQuery = '';
  readonly search$ = new Subject<string>();

  statusBadge(s: string): string {
    if (s === 'Active') return 'badge badge-success';
    if (s === 'Pending') return 'badge badge-warning';
    if (s === 'Rejected') return 'badge badge-error';
    return 'badge badge-neutral';
  }

  ngOnInit(): void {
    this.loadPage(1);
    this.search$.pipe(debounceTime(300), distinctUntilChanged()).subscribe(q => {
      this.searchQuery = q;
      this.loadPage(1);
    });
  }

  loadPage(p: number): void {
    this.page.set(p);
    this.loading.set(true);
    this.adminApi.getDealers(p, 20, this.searchQuery || undefined).subscribe({
      next: r => { this.dealers.set(r.items); this.totalCount.set(r.totalCount); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}
