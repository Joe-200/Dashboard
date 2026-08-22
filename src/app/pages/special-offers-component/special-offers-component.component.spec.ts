import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SpecialOffersComponentComponent } from './special-offers-component.component';

describe('SpecialOffersComponentComponent', () => {
  let component: SpecialOffersComponentComponent;
  let fixture: ComponentFixture<SpecialOffersComponentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpecialOffersComponentComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SpecialOffersComponentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
