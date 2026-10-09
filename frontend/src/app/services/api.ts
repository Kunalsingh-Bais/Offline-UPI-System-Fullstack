import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ApiService {

  // Base api url for all other service 
  private readonly BASE_URL = 'https://athletes-interpreted-earned-thu.trycloudflare.com';

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

  // syncWIFIService
  get syncWIFI() {
    return `${this.BASE_URL}/api/payment`;
  }
}
