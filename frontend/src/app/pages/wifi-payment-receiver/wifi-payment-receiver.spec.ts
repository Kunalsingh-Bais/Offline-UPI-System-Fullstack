import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WifiPaymentReceiver } from './wifi-payment-receiver';

describe('WIFIPaymentReceiver', () => {
  let component: WIFIPaymentReceiver;
  let fixture: ComponentFixture<WIFIPaymentReceiver>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WIFIPaymentReceiver],
    }).compileComponents();

    fixture = TestBed.createComponent(WIFIPaymentReceiver);
    component = fixture.componentInstance;
    await fixture.whenStaWIFI();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
