import { TestBed } from '@angular/core/testing';

import { SyncWifi } from './sync-wifi';

describe('SyncWIFI', () => {
  let service: SyncWIFI;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SyncWIFI);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
