import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, bufferCV } from "@stacks/transactions";

// Define all error constants to match Clarity contract
const ERR_INVALID_AMOUNT = 100;
const ERR_RECIPIENT_NOT_VERIFIED = 101;
const ERR_DONATION_NOT_FOUND = 102;
const ERR_NOT_RECIPIENT = 103;
const ERR_DONATION_ALREADY_CLAIMED = 104;
const ERR_CANNOT_CANCEL = 105;
const ERR_INVALID_PURPOSE = 106;
const ERR_VAULT_ERROR = 107;
const ERR_TRACKER_ERROR = 108;
const ERR_INVALID_DONOR = 110;
const ERR_CLAIM_TIMEOUT = 113;
const ERR_CANCEL_TIMEOUT = 114;
const ERR_NOT_AUTHORIZED = 999;

interface Donation {
  amount: number;
  recipientId: Buffer;
  purpose: string;
  donor: string;
  status: string;
  timestamp: number;
  claimed: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class RecipientRegistryMock {
  verifiedRecipients: Set<string> = new Set();
  recipientIds: Map<string, Buffer> = new Map();

  isVerifiedRecipient(recipientId: Buffer): Result<boolean> {
    const idStr = recipientId.toString('hex');
    return { ok: true, value: this.verifiedRecipients.has(idStr) };
  }

  addVerifiedRecipient(principal: string, id: Buffer): void {
    this.verifiedRecipients.add(id.toString('hex'));
    this.recipientIds.set(principal, id);
  }

  getRecipientId(principal: string): Buffer | null {
    return this.recipientIds.get(principal) || null;
  }
}

class DonationVaultMock {
  lockedFunds: Map<number, { amount: number; recipientId: string; id: number }> = new Map();
  refunds: Array<{ id: number; amount: number }> = [];
  releases: Array<{ id: number }> = [];

  lockFunds(amount: number, recipientId: Buffer, id: number): Result<boolean> {
    const idStr = recipientId.toString('hex');
    this.lockedFunds.set(id, { amount, recipientId: idStr, id });
    return { ok: true, value: true };
  }

  releaseFunds(id: number): Result<boolean> {
    if (!this.lockedFunds.has(id)) return { ok: false, value: ERR_VAULT_ERROR };
    this.releases.push({ id });
    this.lockedFunds.delete(id);
    return { ok: true, value: true };
  }

  refund(id: number): Result<boolean> {
    const fund = this.lockedFunds.get(id);
    if (!fund) return { ok: false, value: ERR_VAULT_ERROR };
    this.refunds.push({ id, amount: fund.amount });
    this.lockedFunds.delete(id);
    return { ok: true, value: true };
  }
}

class DonationTrackerMock {
  logs: Array<{ id: number; amount: number; recipientId: string; purpose: string }> = [];
  updates: Array<{ id: number; status: string }> = [];

  logDonation(id: number, amount: number, recipientId: Buffer, purpose: string): Result<boolean> {
    const idStr = recipientId.toString('hex');
    this.logs.push({ id, amount, recipientId: idStr, purpose });
    return { ok: true, value: true };
  }

  updateDonationStatus(id: number, status: string): Result<boolean> {
    this.updates.push({ id, status });
    return { ok: true, value: true };
  }
}

class DonationProcessorMock {
  state: {
    nextDonationId: number;
    claimTimeout: number;
    cancelTimeout: number;
    adminPrincipal: string;
    donations: Map<number, Donation>;
    donationLocks: Map<number, boolean>;
  } = {
    nextDonationId: 0,
    claimTimeout: 100,
    cancelTimeout: 50,
    adminPrincipal: "ST1ADMIN",
    donations: new Map(),
    donationLocks: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1DONOR";
  registry: RecipientRegistryMock;
  vault: DonationVaultMock;
  tracker: DonationTrackerMock;

  constructor() {
    this.registry = new RecipientRegistryMock();
    this.vault = new DonationVaultMock();
    this.tracker = new DonationTrackerMock();
    this.reset();
  }

  reset() {
    this.state = {
      nextDonationId: 0,
      claimTimeout: 100,
      cancelTimeout: 50,
      adminPrincipal: "ST1ADMIN",
      donations: new Map(),
      donationLocks: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1DONOR";
    this.registry.verifiedRecipients.clear();
    this.vault.lockedFunds.clear();
    this.vault.refunds = [];
    this.vault.releases = [];
    this.tracker.logs = [];
    this.tracker.updates = [];
  }

  validateAmount(amt: number): Result<boolean> {
    return amt > 0 ? { ok: true, value: true } : { ok: false, value: ERR_INVALID_AMOUNT };
  }

  validatePurpose(pur: string): Result<boolean> {
    return pur.length > 0 && pur.length <= 256 ? { ok: true, value: true } : { ok: false, value: ERR_INVALID_PURPOSE };
  }

  validateRecipientId(rid: Buffer): Result<boolean> {
    return rid.length > 0 ? { ok: true, value: true } : { ok: false, value: ERR_RECIPIENT_NOT_VERIFIED };
  }

  validateDonationId(id: number): Result<boolean> {
    return this.state.donations.has(id) ? { ok: true, value: true } : { ok: false, value: ERR_DONATION_NOT_FOUND };
  }

  validateDonor(donor: string): Result<boolean> {
    return donor === this.caller ? { ok: true, value: true } : { ok: false, value: ERR_INVALID_DONOR };
  }

  validateRecipient(rid: Buffer, id: number): Result<boolean> {
    const don = this.state.donations.get(id);
    if (!don) return { ok: false, value: ERR_DONATION_NOT_FOUND };
    const recipientId = this.registry.getRecipientId(this.caller);
    if (!recipientId || recipientId.toString('hex') !== don.recipientId.toString('hex')) {
      return { ok: false, value: ERR_NOT_RECIPIENT };
    }
    return { ok: true, value: true };
  }

  checkClaimTimeout(id: number): Result<boolean> {
    const don = this.state.donations.get(id);
    if (!don) return { ok: false, value: ERR_DONATION_NOT_FOUND };
    return this.blockHeight > don.timestamp + this.state.claimTimeout
      ? { ok: false, value: ERR_CLAIM_TIMEOUT }
      : { ok: true, value: true };
  }

  checkCancelTimeout(id: number): Result<boolean> {
    const don = this.state.donations.get(id);
    if (!don) return { ok: false, value: ERR_DONATION_NOT_FOUND };
    return this.blockHeight > don.timestamp + this.state.cancelTimeout
      ? { ok: false, value: ERR_CANCEL_TIMEOUT }
      : { ok: true, value: true };
  }

  donate(amount: number, recipientId: Buffer, purpose: string): Result<number> {
    const validatedAmount = this.validateAmount(amount);
    if (!validatedAmount.ok) return { ok: false, value: validatedAmount.value };
    const validatedPurpose = this.validatePurpose(purpose);
    if (!validatedPurpose.ok) return { ok: false, value: validatedPurpose.value };
    const validatedRid = this.validateRecipientId(recipientId);
    if (!validatedRid.ok) return { ok: false, value: validatedRid.value };
    const regResult = this.registry.isVerifiedRecipient(recipientId);
    if (!regResult.ok || !regResult.value) return { ok: false, value: ERR_RECIPIENT_NOT_VERIFIED };
    const id = this.state.nextDonationId;
    const vaultResult = this.vault.lockFunds(amount, recipientId, id);
    if (!vaultResult.ok) return { ok: false, value: ERR_VAULT_ERROR };
    this.state.donations.set(id, {
      amount,
      recipientId,
      purpose,
      donor: this.caller,
      status: "pending",
      timestamp: this.blockHeight,
      claimed: false,
    });
    this.state.donationLocks.set(id, true);
    const trackResult = this.tracker.logDonation(id, amount, recipientId, purpose);
    if (!trackResult.ok) return { ok: false, value: ERR_TRACKER_ERROR };
    this.state.nextDonationId++;
    return { ok: true, value: id };
  }

  claimDonation(donationId: number): Result<boolean> {
    const validatedId = this.validateDonationId(donationId);
    if (!validatedId.ok) return { ok: false, value: validatedId.value };
    const validatedTimeout = this.checkClaimTimeout(donationId);
    if (!validatedTimeout.ok) return { ok: false, value: validatedTimeout.value };
    const don = this.state.donations.get(donationId)!;
    if (don.claimed) return { ok: false, value: ERR_DONATION_ALREADY_CLAIMED };
    const validatedRecipient = this.validateRecipient(don.recipientId, donationId);
    if (!validatedRecipient.ok) return { ok: false, value: validatedRecipient.value };
    const vaultResult = this.vault.releaseFunds(donationId);
    if (!vaultResult.ok) return { ok: false, value: vaultResult.value };
    this.state.donations.set(donationId, { ...don, status: "claimed", claimed: true });
    this.state.donationLocks.set(donationId, false);
    const trackResult = this.tracker.updateDonationStatus(donationId, "claimed");
    if (!trackResult.ok) return { ok: false, value: trackResult.value };
    return { ok: true, value: true };
  }

  cancelDonation(donationId: number): Result<boolean> {
    const validatedId = this.validateDonationId(donationId);
    if (!validatedId.ok) return { ok: false, value: validatedId.value };
    const validatedTimeout = this.checkCancelTimeout(donationId);
    if (!validatedTimeout.ok) return { ok: false, value: validatedTimeout.value };
    const don = this.state.donations.get(donationId)!;
    if (don.claimed) return { ok: false, value: ERR_CANNOT_CANCEL };
    const validatedDonor = this.validateDonor(don.donor);
    if (!validatedDonor.ok) return { ok: false, value: validatedDonor.value };
    const vaultResult = this.vault.refund(donationId);
    if (!vaultResult.ok) return { ok: false, value: vaultResult.value };
    this.state.donations.set(donationId, { ...don, status: "cancelled", claimed: false });
    this.state.donationLocks.set(donationId, false);
    const trackResult = this.tracker.updateDonationStatus(donationId, "cancelled");
    if (!trackResult.ok) return { ok: false, value: trackResult.value };
    return { ok: true, value: true };
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.adminPrincipal = newAdmin;
    return { ok: true, value: true };
  }

  setTimeouts(claimTo: number, cancelTo: number): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (claimTo <= 0 || cancelTo <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    this.state.claimTimeout = claimTo;
    this.state.cancelTimeout = cancelTo;
    return { ok: true, value: true };
  }

  getDonationCount(): Result<number> {
    return { ok: true, value: this.state.nextDonationId };
  }

  getDonation(id: number): Donation | null {
    return this.state.donations.get(id) || null;
  }
}

describe("DonationProcessor", () => {
  let contract: DonationProcessorMock;

  beforeEach(() => {
    contract = new DonationProcessorMock();
    contract.reset();
    contract.registry.addVerifiedRecipient("recipient1", Buffer.from("recipient1"));
  });

  it("donates successfully", () => {
    const recipientId = Buffer.from("recipient1");
    const result = contract.donate(1000, recipientId, "Relief");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const donation = contract.getDonation(0);
    expect(donation?.amount).toBe(1000);
    expect(donation?.purpose).toBe("Relief");
    expect(donation?.status).toBe("pending");
    expect(donation?.claimed).toBe(false);
    expect(contract.vault.lockedFunds.size).toBe(1);
    expect(contract.tracker.logs.length).toBe(1);
  });

  it("rejects invalid amount", () => {
    const recipientId = Buffer.from("recipient1");
    const result = contract.donate(0, recipientId, "Relief");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });

  it("rejects unverified recipient", () => {
    const recipientId = Buffer.from("unverified");
    const result = contract.donate(1000, recipientId, "Relief");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_RECIPIENT_NOT_VERIFIED);
  });

  it("claims donation successfully", () => {
    const recipientId = Buffer.from("recipient1");
    contract.donate(1000, recipientId, "Relief");
    contract.caller = "recipient1";
    const result = contract.claimDonation(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const donation = contract.getDonation(0);
    expect(donation?.status).toBe("claimed");
    expect(donation?.claimed).toBe(true);
    expect(contract.vault.releases.length).toBe(1);
    expect(contract.tracker.updates.length).toBe(1);
  });

  it("rejects claim for non-recipient", () => {
    const recipientId = Buffer.from("recipient1");
    contract.donate(1000, recipientId, "Relief");
    contract.caller = "fake";
    const result = contract.claimDonation(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_RECIPIENT);
  });

  it("rejects already claimed donation", () => {
    const recipientId = Buffer.from("recipient1");
    contract.donate(1000, recipientId, "Relief");
    contract.caller = "recipient1";
    contract.claimDonation(0);
    const result = contract.claimDonation(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DONATION_ALREADY_CLAIMED);
  });

  it("cancels donation successfully", () => {
    const recipientId = Buffer.from("recipient1");
    contract.donate(1000, recipientId, "Relief");
    const result = contract.cancelDonation(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const donation = contract.getDonation(0);
    expect(donation?.status).toBe("cancelled");
    expect(donation?.claimed).toBe(false);
    expect(contract.vault.refunds.length).toBe(1);
    expect(contract.tracker.updates.length).toBe(1);
  });

  it("rejects cancel for claimed donation", () => {
    const recipientId = Buffer.from("recipient1");
    contract.donate(1000, recipientId, "Relief");
    contract.caller = "recipient1";
    contract.claimDonation(0);
    contract.caller = "ST1DONOR";
    const result = contract.cancelDonation(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CANNOT_CANCEL);
  });

  it("rejects cancel by non-donor", () => {
    const recipientId = Buffer.from("recipient1");
    contract.donate(1000, recipientId, "Relief");
    contract.caller = "fake";
    const result = contract.cancelDonation(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DONOR);
  });

  it("sets admin successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setAdmin("ST2ADMIN");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.adminPrincipal).toBe("ST2ADMIN");
  });

  it("rejects set admin by non-admin", () => {
    const result = contract.setAdmin("ST2ADMIN");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets timeouts successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setTimeouts(200, 100);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.claimTimeout).toBe(200);
    expect(contract.state.cancelTimeout).toBe(100);
  });

  it("rejects invalid timeouts", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setTimeouts(0, 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });

  it("returns correct donation count", () => {
    const recipientId = Buffer.from("recipient1");
    contract.donate(1000, recipientId, "Relief");
    contract.donate(2000, recipientId, "Aid");
    const result = contract.getDonationCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("rejects claim after timeout", () => {
    const recipientId = Buffer.from("recipient1");
    contract.donate(1000, recipientId, "Relief");
    contract.blockHeight = 101;
    contract.caller = "recipient1";
    const result = contract.claimDonation(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CLAIM_TIMEOUT);
  });

  it("rejects cancel after timeout", () => {
    const recipientId = Buffer.from("recipient1");
    contract.donate(1000, recipientId, "Relief");
    contract.blockHeight = 51;
    const result = contract.cancelDonation(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CANCEL_TIMEOUT);
  });

  it("parses Clarity types", () => {
    const purpose = stringUtf8CV("Relief");
    const amount = uintCV(1000);
    const rid = bufferCV(Buffer.from("recipient1"));
    expect(purpose.value).toBe("Relief");
    expect(amount.value).toEqual(BigInt(1000));
    expect(rid.value).toEqual(Buffer.from("recipient1").toString('hex'));
  });
});