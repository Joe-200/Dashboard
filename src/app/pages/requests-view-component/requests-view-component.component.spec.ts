import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RequestsViewComponent } from './requests-view-component.component';

describe('RequestsViewComponentComponent', () => {
  let component: RequestsViewComponent;
  let fixture: ComponentFixture<RequestsViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RequestsViewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RequestsViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
