# 🌍 Transparent Donation Tracking System

Welcome to a blockchain-based solution for tracking charitable donations with full transparency! Built on the Stacks blockchain using Clarity smart contracts, this project ensures donations are traceable from donor to recipient, fostering trust and accountability in philanthropy.

## ✨ Features

- 💸 **Secure Donation Submission**: Donors can send funds with metadata about intended use.
- 🏦 **Recipient Verification**: Charities or recipients register and are verified before receiving funds.
- 📜 **Immutable Tracking**: Every donation transfer is logged on-chain for transparency.
- 🔍 **Public Auditability**: Anyone can verify donation flows and recipient details.
- 🔐 **Access Control**: Only authorized parties can update donation statuses or withdraw funds.
- 📊 **Reporting**: Generate reports on donation usage for donors and the public.
- 🚫 **Fraud Prevention**: Prevents unauthorized withdrawals and duplicate claims.

## 🛠 How It Works

### For Donors
1. Register a donation by calling the `donate` function with:
   - Amount in STX (Stacks token).
   - Recipient ID (verified charity or individual).
   - Optional: Intended use (e.g., "Disaster Relief").
2. Funds are locked in the `DonationVault` contract until the recipient claims them.
3. Track your donation’s status using `get-donation-details`.

### For Recipients
1. Register as a recipient via the `RecipientRegistry` contract with:
   - Name, description, and proof of legitimacy (e.g., public key or off-chain verification hash).
2. Claim donations using the `claim-donation` function in the `DonationProcessor` contract.
3. Provide updates on fund usage via the `update-donation-status` function.

### For Auditors
1. Use `get-donation-details` to view donation metadata (amount, recipient, status).
2. Verify recipient legitimacy via `get-recipient-details`.
3. Generate usage reports with the `generate-report` function.

### Smart Contracts (8 Total)
1. **DonationVault**: Stores donated funds securely and releases them to verified recipients.
2. **RecipientRegistry**: Manages recipient registration and verification.
3. **DonationProcessor**: Handles donation submission and claiming logic.
4. **DonationTracker**: Logs donation metadata and transfer history immutably.
5. **AccessControl**: Manages permissions for admins, recipients, and donors.
6. **Reporting**: Generates reports on donation flows and usage.
7. **Verification**: Validates recipient legitimacy using public keys or hashes.
8. **Escrow**: Temporarily holds funds for disputed or conditional donations.

## 📦 Smart Contract Details

### 1. DonationVault
- Stores STX donations in escrow.
- Functions:
  - `lock-funds`: Locks donated funds for a recipient.
  - `release-funds`: Releases funds to a verified recipient.
  - `refund`: Refunds donor if donation is unclaimed after a deadline.

### 2. RecipientRegistry
- Registers and verifies recipients.
- Functions:
  - `register-recipient`: Adds a recipient with name, description, and verification data.
  - `verify-recipient`: Marks a recipient as verified by an admin.
  - `get-recipient-details`: Retrieves recipient information.

### 3. DonationProcessor
- Manages donation submission and claiming.
- Functions:
  - `donate`: Submits a donation with amount, recipient, and purpose.
  - `claim-donation`: Allows verified recipients to claim funds.
  - `cancel-donation`: Allows donors to cancel unclaimed donations.

### 4. DonationTracker
- Logs donation metadata and history.
- Functions:
  - `log-donation`: Records donation details (amount, recipient, timestamp).
  - `get-donation-details`: Retrieves donation history.
  - `update-donation-status`: Updates status (e.g., "Funds Used").

### 5. AccessControl
- Manages roles and permissions.
- Functions:
  - `add-admin`: Assigns admin privileges.
  - `restrict-access`: Ensures only authorized users call sensitive functions.
  - `revoke-access`: Removes permissions if needed.

### 6. Reporting
- Generates donation reports.
- Functions:
  - `generate-report`: Creates a summary of donation flows for a recipient or time period.
  - `get-total-donated`: Returns total donations to a recipient.

### 7. Verification
- Validates recipient legitimacy.
- Functions:
  - `submit-verification`: Submits proof (e.g., hash of legal documents).
  - `confirm-verification`: Admin confirms recipient legitimacy.

### 8. Escrow
- Handles conditional or disputed donations.
- Functions:
  - `lock-escrow`: Locks funds with conditions (e.g., time-based release).
  - `resolve-escrow`: Resolves disputes by releasing or refunding funds.

## 🚀 Getting Started

1. **Deploy Contracts**: Deploy the Clarity contracts on the Stacks blockchain using the Stacks CLI.
2. **Register Recipients**: Admins register and verify recipients via `RecipientRegistry`.
3. **Donate**: Donors use the `DonationProcessor` to send STX with metadata.
4. **Track & Verify**: Use `DonationTracker` and `Reporting` to monitor donation flows.
5. **Claim Funds**: Verified recipients claim funds via `DonationProcessor`.

## 🛡️ Security Considerations
- **Access Control**: Only verified recipients can claim funds, and only admins can verify recipients.
- **Immutability**: Donation logs are tamper-proof on the Stacks blockchain.
- **Escrow Safety**: Funds in disputed donations are held securely until resolved.
- **Auditability**: All actions are logged for public verification.


## 🌟 Why This Matters
This system solves the real-world problem of opaque donation processes by:
- Ensuring donors know exactly where their money goes.
- Preventing fraud through recipient verification.
- Providing public auditability for trust and accountability.

Built with Clarity on Stacks, it’s secure, scalable, and ready to make a difference!