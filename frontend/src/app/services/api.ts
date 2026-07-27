import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ApiService {

  // Base api url for all other service 
  private readonly BASE_URL = 'http://10.189.165.26:8080';

  constructor() {}

  // authService
  get auth() {
    return `${this.BASE_URL}/api/auth`;
  }

  // userService
  get user() {
    return `${this.BASE_URL}/api/user`;
  }

  // transactionService
  get transaction() {
    return `${this.BASE_URL}/api/transaction`;
  }

  // syncBLEService
  get syncBLE() {
    return `${this.BASE_URL}/api/transactions`;
  }
}
