// AzeriCard result codes — the pure half.
//
// ACTION is the gateway's own verdict (spec §2, "Cavab formatı"); RC is the
// ISO-8583 field 39 response code from the issuer. Both arrive on the callback
// AND on the TRTYPE 90 status response, so the mapping lives in one place.

/** ACTION values the gateway documents. */
export const GATEWAY_ACTIONS = {
  /** "0 – Tranzaksiya uğurla tamamlandı" — completed successfully. */
  SUCCESS: "0",
  /** "1 – Dublikat əməliyyat aşkar edildi" — duplicate detected. */
  DUPLICATE: "1",
  /** "2 – Tranzaksiya rədd edildi" — declined. */
  DECLINED: "2",
  /** "3 – Tranzaksiya emal xətası" — processing error. */
  ERROR: "3",
  /** "6 – İmtina edilmiş əməliyyatın təkrarlanması" — retry of a refused op. */
  RETRY_REFUSED: "6",
  /** "7 – Doğrulama xətası ilə əməliyyatın təkrarlanması" — retry after auth error. */
  RETRY_AUTH_ERROR: "7",
  /** "8 – Cavab verilmədən dayandırılmış əməliyyatın təkrarlanması". */
  RETRY_NO_RESPONSE: "8",
} as const;

/** The ISO-8583 field 39 value that means "approved". */
export const RC_APPROVED = "00";

/**
 * Our normalised verdict. Deliberately coarse: the only distinction the rest of
 * the system is allowed to act on is "the gateway says this specific order was
 * paid" versus "it did not say that".
 */
export type PaymentOutcome = "approved" | "declined" | "failed" | "pending" | "unknown";

/**
 * Map ACTION (+ RC when present) onto an outcome.
 *
 * The bar for "approved" is deliberately high and CONJUNCTIVE: ACTION must be
 * "0" AND, if an RC is present at all, it must be "00". A missing RC on an
 * ACTION=0 response is treated as approved because the spec permits APPROVAL/RC
 * to be blank when the card management system does not supply them — but an RC
 * that is present and is not "00" always wins, because an issuer decline that
 * somehow arrives with ACTION=0 is exactly the kind of contradiction that must
 * not be resolved in the payer's favour.
 */
export function outcomeFromCodes(
  action: string | null | undefined,
  rc: string | null | undefined,
): PaymentOutcome {
  const a = typeof action === "string" ? action.trim() : "";
  const r = typeof rc === "string" ? rc.trim() : "";

  if (r !== "" && r !== RC_APPROVED && a === GATEWAY_ACTIONS.SUCCESS) {
    return "declined";
  }
  switch (a) {
    case GATEWAY_ACTIONS.SUCCESS:
      return "approved";
    case GATEWAY_ACTIONS.DUPLICATE:
      // A duplicate is NOT a second payment. It is the gateway telling us it
      // already has this one; the ledger must not gain a row from it.
      return "pending";
    case GATEWAY_ACTIONS.DECLINED:
      return "declined";
    case GATEWAY_ACTIONS.ERROR:
      return "failed";
    case GATEWAY_ACTIONS.RETRY_REFUSED:
    case GATEWAY_ACTIONS.RETRY_AUTH_ERROR:
    case GATEWAY_ACTIONS.RETRY_NO_RESPONSE:
      return "pending";
    default:
      return "unknown";
  }
}

/** The `payment_status` enum value (SQL 001) for an outcome. */
export function paymentStatusFor(
  outcome: PaymentOutcome,
): "pending" | "succeeded" | "failed" {
  if (outcome === "approved") return "succeeded";
  if (outcome === "declined" || outcome === "failed") return "failed";
  return "pending";
}
