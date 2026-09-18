# Offline P2P Payment System 💸

An offline-first, peer-to-peer payment architecture designed to allow users to securely transfer funds without an active internet connection. This project utilizes edge computing to route transactions over local Wi-Fi and automatically syncs them to a cloud backend once internet connectivity is restored.

## 🏗️ Architecture: The Two Worlds

This system operates in two distinct environments to guarantee zero-downtime payments:

1. **The Edge (Offline Local Network)**
   * A lightweight **Node.js Relay Server** runs locally (e.g., on a merchant's laptop or Raspberry Pi) and creates a local Wi-Fi network.
   * Users connect to this network. The Angular app uses the Node server as a "blind courier" to instantly route encrypted payments between the sender and receiver.
   * Transactions are saved locally on the users' devices using **IndexedDB** with a `PENDING` status.

2. **The Cloud (Online Settlement)**
   * The **Spring Boot Backend** and relational database live in the cloud.
   * Once a user's phone regains 4G/5G internet access, the Angular app automatically wakes up and syncs the pending IndexedDB transactions to the cloud.
   * Spring Boot decrypts the data, updates the official bank balances, and changes the transaction status to `SUCCESS`.

## 💻 Tech Stack

* **Frontend:** Angular, TypeScript, HTML5/CSS3, IndexedDB (Local Storage)
* **Cloud Backend:** Java, Spring Boot, PostgreSQL / MySQL
* **Edge Relay:** Node.js, Express
* **Security:** RSA Public-Key Exchange, AES Payload Encryption (Zero-Trust Model)
* **DevOps:** Docker, Git

## ✨ Key Features

* **Internet-Free Routing:** Exchange funds in dead zones, basements, or rural areas using local Wi-Fi.
* **Zero-Trust Security:** The local Node.js server has no database and no private keys. It only passes encrypted ciphertext, meaning local networks cannot intercept or read financial data.
* **Auto-Sync Pipeline:** Seamless background syncing detects when the internet returns and pushes batched payloads to the main server.
* **Responsive UI:** Real-time transaction statuses (Pending → Synced) and a clean, mobile-first design.

## 🔄 Transaction Lifecycle (Credit & Debit Logic)

To prevent double-spending and ensure accurate ledger balances during offline phases, the system uses a two-step reconciliation process:

1. **Local Hold (Optimistic UI):** When an offline transfer is initiated, the Angular app immediately deducts the amount from the sender's local UI balance and creates a `PENDING` transaction. This local lock prevents the user from attempting to spend the same offline funds twice.
2. **Cloud Validation:** Upon internet restoration, the Node.js relay pushes the batched payloads to the Spring Boot backend. 
3. **ACID Database Execution:** The backend verifies the sender's true authoritative balance in MySQL. If funds are sufficient, Spring Boot executes an atomic database transaction to simultaneously **DEBIT** the sender's account and **CREDIT** the receiver's account.
4. **Final Settlement:** If the database transaction commits, the status updates to `SUCCESS`. If the sender had insufficient funds on the server (e.g., they spent money online from another device), the transaction is rolled back, marked as `FAILED`, and the frontend UI balance is reverted.

## 🚀 Getting Started

### 1. Run the Local Edge Server (Offline Mode)
Navigate to the offline relay folder and start the Node server:
```bash
cd Offline-Node-Relay
npm install
node server.js
```

### 2. Run the Cloud Backend (Spring Boot)
Ensure you have Java 17+ installed and your PostgreSQL/MySQL database is running.

1. Navigate to the backend directory:
```bash
cd Cloud-Backend-SpringBoot
```

2. Update the database credentials in `src/main/resources/application.properties`:
```properties
spring.datasource.url=jdbc:mysql://localhost:5432/offline_upi_db
spring.datasource.username=your_username
spring.datasource.password=your_password
```

3. Build and start the server:
```bash
mvn clean install
mvn spring-boot:run
```
*The cloud backend will start on `http://localhost:8080`*

### 3. Run the Frontend App (Angular)
Ensure you have Node.js and the Angular CLI installed on your machine.

1. Navigate to the frontend directory:
```bash
cd Frontend-Angular
```

2. Install the required dependencies:
```bash
npm install
```

3. Start the development server:
```bash
ng serve
```
*Open your browser and navigate to `http://localhost:4200`*

### 4. Simulating the Offline Flow
1. Turn off your machine's Wi-Fi (or use Chrome DevTools to set the network to 'Offline').
2. Initiate a transfer on the Angular UI (`http://localhost:4200`). The transaction will route through the Local Node Server and save to IndexedDB as `PENDING`.
3. Re-enable your internet connection. The Angular app will detect the network, automatically push the payload to the Spring Boot backend, and update the UI status to `SUCCESS`.
