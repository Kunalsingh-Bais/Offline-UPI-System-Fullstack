import { TestBed } from '@angular/core/testing';

import { CapacitorBluetooth } from './capacitor-bluetooth';

describe('CapacitorBluetooth', () => {
  let service: CapacitorBluetooth;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CapacitorBluetooth);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
