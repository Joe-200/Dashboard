import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { HomeComponent } from './pages/home/home.component';
import { AuthGuard } from './auth-guard.guard';
import { RoomsComponent } from './pages/rooms-component/rooms-component.component';
import { SpecialOffersComponent } from './pages/special-offers-component/special-offers-component.component';
import { AiComponent } from './pages/ai-component/ai-component.component';
import { CalendarComponent } from './pages/calendar-component/calendar-component.component';
export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: HomeComponent,
    canActivate: [AuthGuard],
    children: [
      { path: 'rooms', component: RoomsComponent },
      { path: 'special-offers', component: SpecialOffersComponent },
      { path: 'ai', component: AiComponent },
      { path: '', redirectTo: 'rooms', pathMatch: 'full' },
      { path: 'calendar', component: CalendarComponent }, // default child
    ]
  },
  { path: '**', redirectTo: '/login' }
];