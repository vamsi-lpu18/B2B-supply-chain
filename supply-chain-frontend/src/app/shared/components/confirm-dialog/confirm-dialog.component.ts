import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  templateUrl: './confirm-dialog.component.html'
})
export class ConfirmDialogComponent {
  readonly title        = input('Confirm');
  readonly message      = input('Are you sure?');
  readonly confirmLabel = input('Confirm');
  readonly confirm      = output<void>();
  readonly cancel       = output<void>();
}
