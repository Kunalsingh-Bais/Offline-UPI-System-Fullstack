import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PaymentCompleteComponent } from './payment-complete';

describe('PaymentComplete', () => {
  let component: PaymentCompleteComponent;
  let fixture: ComponentFixture<PaymentCompleteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentCompleteComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentCompleteComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
