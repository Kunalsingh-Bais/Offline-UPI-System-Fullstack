import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BleRoleSelection } from './ble-role-selection';

describe('BleRoleSelection', () => {
  let component: BleRoleSelection;
  let fixture: ComponentFixture<BleRoleSelection>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BleRoleSelection],
    }).compileComponents();

    fixture = TestBed.createComponent(BleRoleSelection);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
