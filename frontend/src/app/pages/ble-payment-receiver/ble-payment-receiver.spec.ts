import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BlePaymentReceiver } from './ble-payment-receiver';

describe('BlePaymentReceiver', () => {
  let component: BlePaymentReceiver;
  let fixture: ComponentFixture<BlePaymentReceiver>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BlePaymentReceiver],
    }).compileComponents();

    fixture = TestBed.createComponent(BlePaymentReceiver);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
