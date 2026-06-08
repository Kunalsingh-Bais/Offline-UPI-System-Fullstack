import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PaymentInitiate } from './payment-initiate';

describe('PaymentInitiate', () => {
  let component: PaymentInitiate;
  let fixture: ComponentFixture<PaymentInitiate>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentInitiate],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentInitiate);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
