import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WifiPaymentComponent } from './wifi-payment';

describe('WifiPayment', () => {
  let component: WifiPaymentComponent;
  let fixture: ComponentFixture<WifiPaymentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WifiPaymentComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WifiPaymentComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
