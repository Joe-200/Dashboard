import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Get the stored values
  const token = localStorage.getItem('token');
  const hotelId = localStorage.getItem('hotelId');

  // Clone the request to add headers
  let authReq = req;

  if (token) {
    authReq = authReq.clone({
      headers: authReq.headers.set('Authorization', `Bearer ${token}`)
    });
  }

  if (hotelId) {
    authReq = authReq.clone({
      headers: authReq.headers.set('X-Tenant-ID', hotelId)
    });
  }

  // Pass the modified request to the next handler
  return next(authReq);
};