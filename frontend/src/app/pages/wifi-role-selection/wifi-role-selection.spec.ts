import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WifiRoleSelection } from './wifi-role-selection';

describe('WIFIRoleSelection', () => {
  let component: WIFIRoleSelection;
  let fixture: ComponentFixture<WIFIRoleSelection>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WIFIRoleSelection],
    }).compileComponents();

    fixture = TestBed.createComponent(WIFIRoleSelection);
    component = fixture.componentInstance;
    await fixture.whenStaWIFI();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
