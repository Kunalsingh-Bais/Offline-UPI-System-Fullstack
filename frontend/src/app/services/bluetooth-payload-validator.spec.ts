import { TestBed } from '@angular/core/testing';

import { BluetoothPayloadValidator } from './bluetooth-payload-validator';

describe('BluetoothPayloadValidator', () => {
  let service: BluetoothPayloadValidator;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BluetoothPayloadValidator);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
