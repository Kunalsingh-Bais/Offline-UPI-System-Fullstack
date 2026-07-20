import { TestBed } from '@angular/core/testing';

import { SyncBle } from './sync-ble';

describe('SyncBle', () => {
  let service: SyncBle;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SyncBle);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
