import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Capacitor } from '@capacitor/core'

@Injectable({
  providedIn: 'root',
})
export class NetworkService {

  constructor(private http: HttpClient) {}

  get<T>(url: string): Observable<T> {
    return this.http.get<T>(url);
  }

  post<T>(url: string, body: any): Observable<T> {
    return this.http.post<T>(url, body);
  }

  put<T>(url: string, body: any): Observable<T> {
    return this.http.put<T>(url, body);
  }

  delete<T>(url: string): Observable<T> {
    return this.http.delete<T>(url);
  }

  private isAndroid(): boolean {
    return Capacitor.getPlatform() === 'android';
    console.log(Capacitor.getPlatform());
  }
  
}
