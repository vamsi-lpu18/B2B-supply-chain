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
  template: `
    <div class="page-content">
      <div class="page-header">
        <div class="page-title">
          <h1>Dealer Management</h1>
          <p>Review dealer onboarding, status, and credit summaries.</p>
        </div>
        <div class="page-actions">
          <a routerLink="/admin/agents/create" class="btn btn-primary">Create Agent</a>
        </div>
      </div>

      <div class="d-flex gap-3 mb-6">
        <input type="search" class="form-control" style="max-width:300px"
               placeholder="🔍 Search by name or email..." [(ngModel)]="searchQuery"
               (ngModelChange)="search$.next($event)">
      </div>

      @if (loading()) {
        <div class="skeleton" style="height:300px;border-radius:8px"></div>
      } @else if (dealers().length === 0) {
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <div class="empty-title">No dealers found</div>
        </div>
      } @else {
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Business</th><th>GST</th>
                <th>Status</th><th>Credit Limit</th><th>Registered</th><th></th>
              </tr>
            </thead>
            <tbody>
              @for (d of dealers(); track d.userId) {
                <tr [routerLink]="['/admin/dealers', d.userId]">
                  <td class="fw-600">{{ d.fullName }}</td>
                  <td class="text-sm">{{ d.email }}</td>
                  <td class="text-sm">{{ d.businessName }}</td>
                  <td class="text-xs text-secondary">{{ d.gstNumber }}</td>
                  <td><span class="badge" [class]="statusBadge(d.status)">{{ d.status }}</span></td>
                  <td class="fw-600">{{ d.creditLimit | currency:'INR':'symbol':'1.0-0' }}</td>
                  <td class="text-sm">{{ d.registeredAtUtc | date:'dd MMM yyyy' }}</td>
                  <td><a [routerLink]="['/admin/dealers', d.userId]" class="btn btn-ghost btn-sm">View →</a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-pagination [currentPage]="page()" [totalCount]="totalCount()" [pageSize]="20" (pageChange)="loadPage($event)" />
      }
    </div>
  `
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
