import { TestBed } from '@angular/core/testing';

import { BluetoothKeyExchange } from './bluetooth-key-exchange';

describe('BluetoothKeyExchange', () => {
  let service: BluetoothKeyExchange;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BluetoothKeyExchange);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
