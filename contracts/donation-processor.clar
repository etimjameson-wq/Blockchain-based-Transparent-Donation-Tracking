(define-constant ERR-INVALID-AMOUNT u100)
(define-constant ERR-RECIPIENT-NOT-VERIFIED u101)
(define-constant ERR-DONATION-NOT-FOUND u102)
(define-constant ERR-NOT-RECIPIENT u103)
(define-constant ERR-DONATION-ALREADY-CLAIMED u104)
(define-constant ERR-CANNOT-CANCEL u105)
(define-constant ERR-INVALID-PURPOSE u106)
(define-constant ERR-VAULT-ERROR u107)
(define-constant ERR-TRACKER-ERROR u108)
(define-constant ERR-REGISTRY-ERROR u109)
(define-constant ERR-INVALID-DONOR u110)
(define-constant ERR-TIMEOUT-REACHED u111)
(define-constant ERR-INVALID-DONATION-ID u112)
(define-constant ERR-CLAIM-TIMEOUT u113)
(define-constant ERR-CANCEL-TIMEOUT u114)

(define-data-var next-donation-id uint u0)
(define-data-var claim-timeout uint u100)
(define-data-var cancel-timeout uint u50)
(define-data-var admin-principal principal tx-sender)

(define-map donations
  uint
  {
    amount: uint,
    recipient-id: (buff 32),
    purpose: (string-utf8 256),
    donor: principal,
    status: (string-ascii 20),
    timestamp: uint,
    claimed: bool
  }
)

(define-map donation-locks
  uint
  bool
)

(define-read-only (get-donation (id uint))
  (map-get? donations id)
)

(define-read-only (is-donation-locked (id uint))
  (default-to false (map-get? donation-locks id))
)

(define-read-only (get-next-donation-id)
  (var-get next-donation-id)
)

(define-private (validate-amount (amt uint))
  (if (> amt u0) (ok true) (err ERR-INVALID-AMOUNT))
)

(define-private (validate-purpose (pur (string-utf8 256)))
  (if (and (> (len pur) u0) (<= (len pur) u256)) (ok true) (err ERR-INVALID-PURPOSE))
)

(define-private (validate-recipient-id (rid (buff 32)))
  (if (> (len rid) u0) (ok true) (err ERR-RECIPIENT-NOT-VERIFIED))
)

(define-private (validate-donation-id (id uint))
  (if (is-some (map-get? donations id)) (ok true) (err ERR-DONATION-NOT-FOUND))
)

(define-private (validate-donor (donor principal))
  (if (is-eq donor tx-sender) (ok true) (err ERR-INVALID-DONOR))
)

(define-private (validate-recipient (rid (buff 32)) (id uint))
  (let ((don (unwrap! (map-get? donations id) (err ERR-DONATION-NOT-CLAIMED))))
    (if (is-eq (get recipient-id don) rid) (ok true) (err ERR-NOT-RECIPIENT))
  )
)

(define-private (check-claim-timeout (id uint))
  (let ((don (unwrap! (map-get? donations id) (err ERR-DONATION-NOT-FOUND)))
        (now block-height)
        (ts (get timestamp don)))
    (if (<= (+ ts (var-get claim-timeout)) now) (err ERR-CLAIM-TIMEOUT) (ok true))
  )
)

(define-private (check-cancel-timeout (id uint))
  (let ((don (unwrap! (map-get? donations id) (err ERR-DONATION-NOT-FOUND)))
        (now block-height)
        (ts (get timestamp don)))
    (if (<= (+ ts (var-get cancel-timeout)) now) (err ERR-CANCEL-TIMEOUT) (ok true))
  )
)

(define-public (donate (amount uint) (recipient-id (buff 32)) (purpose (string-utf8 256)))
  (let ((next-id (var-get next-donation-id))
        (validated-amount (validate-amount amount))
        (validated-purpose (validate-purpose purpose))
        (validated-rid (validate-recipient-id recipient-id)))
    (try! validated-amount)
    (try! validated-purpose)
    (try! validated-rid)
    (try! (contract-call? .recipient-registry is-verified-recipient recipient-id))
    (try! (as-contract (contract-call? .donation-vault lock-funds amount recipient-id next-id)))
    (map-set donations next-id
      {
        amount: amount,
        recipient-id: recipient-id,
        purpose: purpose,
        donor: tx-sender,
        status: "pending",
        timestamp: block-height,
        claimed: false
      }
    )
    (map-set donation-locks next-id true)
    (try! (contract-call? .donation-tracker log-donation next-id amount recipient-id purpose))
    (var-set next-donation-id (+ next-id u1))
    (print { event: "donation-submitted", id: next-id })
    (ok next-id)
  )
)

(define-public (claim-donation (donation-id uint))
  (let ((validated-id (validate-donation-id donation-id))
        (validated-timeout (check-claim-timeout donation-id))
        (recipient tx-sender)
        (don (unwrap! (map-get? donations donation-id) (err ERR-DONATION-NOT-FOUND))))
    (try! validated-id)
    (try! validated-timeout)
    (asserts! (not (get claimed don)) (err ERR-DONATION-ALREADY-CLAIMED))
    (try! (validate-recipient (get recipient-id don) donation-id))
    (try! (as-contract (contract-call? .donation-vault release-funds donation-id)))
    (map-set donations donation-id
      {
        amount: (get amount don),
        recipient-id: (get recipient-id don),
        purpose: (get purpose don),
        donor: (get donor don),
        status: "claimed",
        timestamp: (get timestamp don),
        claimed: true
      }
    )
    (map-set donation-locks donation-id false)
    (try! (contract-call? .donation-tracker update-donation-status donation-id "claimed"))
    (print { event: "donation-claimed", id: donation-id })
    (ok true)
  )
)

(define-public (cancel-donation (donation-id uint))
  (let ((validated-id (validate-donation-id donation-id))
        (validated-timeout (check-cancel-timeout donation-id))
        (don (unwrap! (map-get? donations donation-id) (err ERR-DONATION-NOT-FOUND))))
    (try! validated-id)
    (try! validated-timeout)
    (asserts! (not (get claimed don)) (err ERR-CANNOT-CANCEL))
    (try! (validate-donor (get donor don)))
    (try! (as-contract (contract-call? .donation-vault refund donation-id)))
    (map-set donations donation-id
      {
        amount: (get amount don),
        recipient-id: (get recipient-id don),
        purpose: (get purpose don),
        donor: (get donor don),
        status: "cancelled",
        timestamp: (get timestamp don),
        claimed: false
      }
    )
    (map-set donation-locks donation-id false)
    (try! (contract-call? .donation-tracker update-donation-status donation-id "cancelled"))
    (print { event: "donation-cancelled", id: donation-id })
    (ok true)
  )
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (var-set admin-principal new-admin)
    (ok true)
  )
)

(define-public (set-timeouts (claim-to uint) (cancel-to uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> claim-to u0) (err ERR-INVALID-AMOUNT))
    (asserts! (> cancel-to u0) (err ERR-INVALID-AMOUNT))
    (var-set claim-timeout claim-to)
    (var-set cancel-timeout cancel-to)
    (ok true)
  )
)

(define-public (get-donation-count)
  (ok (var-get next-donation-id))
)