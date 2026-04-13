import { Component, computed, inject, signal, OnInit, input } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CatalogApiService } from '../../../core/api/catalog-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { CategoryDto } from '../../../core/models/catalog.models';

interface CategoryGroupEntry {
  parent: CategoryDto;
  children: CategoryDto[];
}

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  template: `
    <div class="page-content feature-catalog">
      <div class="page-header">
        <h1>{{ isEdit() ? 'Edit Product' : 'Create Product' }}</h1>
        <a routerLink="/products" class="btn btn-secondary">Cancel</a>
      </div>

      <div class="card" style="max-width:700px">
        <form [formGroup]="form" (ngSubmit)="submit()">
          <div class="grid-2">
            <div class="form-group">
              <label>SKU *</label>
              <input type="text" class="form-control" formControlName="sku" maxlength="60" [readonly]="isEdit()">
              @if (err('sku')) { <span class="form-error">SKU is required (letters, numbers, hyphen, underscore; max 60 chars)</span> }
            </div>
            <div class="form-group">
              <label>Name *</label>
              <input type="text" class="form-control" formControlName="name" maxlength="200">
              @if (err('name')) { <span class="form-error">Name is required (max 200 chars)</span> }
            </div>
            <div class="form-group">
              <label>Unit Price *</label>
              <input type="number" class="form-control" formControlName="unitPrice" min="0.01" step="0.01">
              @if (err('unitPrice')) { <span class="form-error">Positive price required</span> }
            </div>
            <div class="form-group">
              <label>Min Order Qty *</label>
              <input type="number" class="form-control" formControlName="minOrderQty" min="1">
              @if (err('minOrderQty')) { <span class="form-error">Positive integer required</span> }
            </div>
            @if (!isEdit()) {
              <div class="form-group">
                <label>Opening Stock *</label>
                <input type="number" class="form-control" formControlName="openingStock" min="0">
                @if (err('openingStock')) { <span class="form-error">Non-negative integer required</span> }
              </div>
            }
            <div class="form-group">
              <label>Category *</label>
              <select class="form-control" formControlName="categoryId" [disabled]="categoriesLoading() || categories().length === 0">
                <option value="">Select category</option>
                @for (group of categoryGroups(); track group.parent.categoryId) {
                  @if (group.children.length > 0) {
                    <optgroup [label]="group.parent.name">
                      <option [value]="group.parent.categoryId">{{ group.parent.name }} (General)</option>
                      @for (child of group.children; track child.categoryId) {
                        <option [value]="child.categoryId">{{ child.name }}</option>
                      }
                    </optgroup>
                  } @else {
                    <option [value]="group.parent.categoryId">{{ group.parent.name }}</option>
                  }
                }
              </select>
              @if (categoriesLoading()) { <small>Loading categories...</small> }
              @if (categoryLoadFailed()) { <small class="form-error">Could not load categories. Try refreshing.</small> }
              @if (!categoriesLoading() && categories().length === 0) { <small class="form-error">No categories available.</small> }
              @if (err('categoryId')) { <span class="form-error">Category is required</span> }
            </div>
          </div>

          <div class="form-group">
            <label>Description *</label>
            <textarea class="form-control" formControlName="description" rows="3" maxlength="2000"></textarea>
            @if (err('description')) { <span class="form-error">Description is required (max 2000 chars)</span> }
          </div>

          <div class="form-group">
            <label>Image URL</label>
            <input type="url" class="form-control" formControlName="imageUrl" maxlength="500" placeholder="https://...">
            @if (err('imageUrl')) { <span class="form-error">Image URL must be valid and max 500 chars</span> }
          </div>

          @if (isEdit()) {
            <div class="form-group">
              <label>
                <input type="checkbox" formControlName="isActive"> Active
              </label>
            </div>
          }

          <div class="d-flex justify-end gap-3 mt-4">
            <a routerLink="/products" class="btn btn-secondary">Cancel</a>
            <button type="submit" class="btn btn-primary" [disabled]="form.invalid || loading()">
              @if (loading()) { <span class="spinner"></span> }
              {{ isEdit() ? 'Update' : 'Create' }} Product
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`.spinner { width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;display:inline-block; } @keyframes spin{to{transform:rotate(360deg);}}`]
})
export class ProductFormComponent implements OnInit {
  readonly id = input<string>();

  private readonly fb         = inject(FormBuilder);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly toast      = inject(ToastService);
  private readonly router     = inject(Router);

  readonly loading = signal(false);
  readonly isEdit  = () => !!this.id();
  readonly categories = signal<CategoryDto[]>([]);
  readonly categoriesLoading = signal(false);
  readonly categoryLoadFailed = signal(false);
  readonly topLevelCategories = computed(() =>
    this.categories()
      .filter(category => !category.parentCategoryId)
      .sort((a, b) => a.name.localeCompare(b.name))
  );
  readonly categoryChildrenMap = computed(() => {
    const map = new Map<string, CategoryDto[]>();
    this.categories().forEach(category => {
      if (!category.parentCategoryId) {
        return;
      }

      if (!map.has(category.parentCategoryId)) {
        map.set(category.parentCategoryId, []);
      }

      map.get(category.parentCategoryId)!.push(category);
    });

    map.forEach((items, key) => {
      map.set(key, [...items].sort((a, b) => a.name.localeCompare(b.name)));
    });

    return map;
  });
  readonly categoryGroups = computed<CategoryGroupEntry[]>(() =>
    this.topLevelCategories().map(parent => ({
      parent,
      children: this.categoryChildrenMap().get(parent.categoryId) ?? []
    }))
  );

  readonly form = this.fb.group({
    sku:          ['', [Validators.required, Validators.maxLength(60), Validators.pattern(/^[A-Za-z0-9-_]+$/)]],
    name:         ['', [Validators.required, Validators.maxLength(200)]],
    description:  ['', [Validators.required, Validators.maxLength(2000)]],
    categoryId:   ['', [Validators.required, Validators.pattern(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)]],
    unitPrice:    [0, [Validators.required, Validators.min(0.01)]],
    minOrderQty:  [1, [Validators.required, Validators.min(1)]],
    openingStock: [0, [Validators.required, Validators.min(0)]],
    imageUrl:     ['', [Validators.maxLength(500), Validators.pattern(/^$|^https?:\/\/.+/)]],
    isActive:     [true]
  });

  err(f: string): boolean { const c = this.form.get(f); return !!(c?.invalid && c.touched); }

  ngOnInit(): void {
    this.loadCategories();

    if (this.isEdit()) {
      this.catalogApi.getProductById(this.id()!).subscribe(p => {
        this.form.patchValue({ ...p, imageUrl: p.imageUrl ?? '' });
        this.form.get('sku')?.disable();
      });
    }
  }

  private loadCategories(): void {
    this.categoriesLoading.set(true);
    this.categoryLoadFailed.set(false);

    this.catalogApi.getCategories().subscribe({
      next: (items) => {
        this.categories.set(items ?? []);
        this.categoriesLoading.set(false);
      },
      error: () => {
        this.categories.set([]);
        this.categoryLoadFailed.set(true);
        this.categoriesLoading.set(false);
      }
    });
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    const v = this.form.getRawValue();

    if (this.isEdit()) {
      this.catalogApi.updateProduct(this.id()!, {
        name: v.name!, description: v.description!, categoryId: v.categoryId!,
        unitPrice: v.unitPrice!, minOrderQty: v.minOrderQty!, imageUrl: v.imageUrl || undefined, isActive: v.isActive!
      }).subscribe({
        next: p => { this.loading.set(false); this.toast.success('Product updated'); this.router.navigate(['/products', p.productId]); },
        error: () => this.loading.set(false)
      });
    } else {
      this.catalogApi.createProduct({
        sku: v.sku!, name: v.name!, description: v.description!, categoryId: v.categoryId!,
        unitPrice: v.unitPrice!, minOrderQty: v.minOrderQty!, openingStock: v.openingStock!, imageUrl: v.imageUrl || undefined
      }).subscribe({
        next: p => { this.loading.set(false); this.toast.success('Product created'); this.router.navigate(['/products', p.productId]); },
        error: () => this.loading.set(false)
      });
    }
  }
}
