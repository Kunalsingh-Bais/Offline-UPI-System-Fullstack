import { TestBed } from '@angular/core/testing';

import { BluetoothPaymentBuilder } from './bluetooth-payment-builder';

describe('BluetoothPaymentBuilder', () => {
  let service: BluetoothPaymentBuilder;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BluetoothPaymentBuilder);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
