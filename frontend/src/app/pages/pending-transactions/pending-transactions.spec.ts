import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PendingTransactions } from './pending-transactions';

describe('PendingTransactions', () => {
  let component: PendingTransactions;
  let fixture: ComponentFixture<PendingTransactions>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PendingTransactions],
    }).compileComponents();

    fixture = TestBed.createComponent(PendingTransactions);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
