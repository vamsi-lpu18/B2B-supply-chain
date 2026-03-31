import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    <div class="modal-backdrop" (click)="cancel.emit()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>{{ title() }}</h2>
          <button class="btn btn-ghost btn-icon" (click)="cancel.emit()">✕</button>
        </div>
        <div class="modal-body">
          <p>{{ message() }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="cancel.emit()">Cancel</button>
          <button class="btn btn-danger" (click)="confirm.emit()">{{ confirmLabel() }}</button>
        </div>
      </div>
    </div>
  `
})
export class ConfirmDialogComponent {
  readonly title        = input('Confirm');
  readonly message      = input('Are you sure?');
  readonly confirmLabel = input('Confirm');
  readonly confirm      = output<void>();
  readonly cancel       = output<void>();
}
