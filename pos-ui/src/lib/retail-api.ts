/** Orithos register/retail client. Prefer these names; `odoo-api` keeps legacy aliases. */
export {
  closeOdooPosSession as closeRetailPosSession,
  getOdooPosBootstrap as getRetailPosBootstrap,
  getOdooSession as getRetailSession,
  OdooApiError as RetailApiError,
  OdooCheckoutPendingError as RetailCheckoutPendingError,
  openOdooPosSession as openRetailPosSession,
  postOdooSessionCash as postRetailSessionCash,
  quoteOdooPosOrder as quoteRetailOrder,
  readQuoteFromSignature,
  recoverOdooPosOrder as recoverRetailOrder,
  searchOdooRecords as searchRetailRecords,
  submitOdooPosOrder as submitRetailOrder,
} from "./odoo-api";

export type {
  OdooCheckoutQuote as RetailCheckoutQuote,
  OdooCheckoutRequest as RetailCheckoutRequest,
  OdooCloseSessionResult as RetailCloseSessionResult,
  OdooCustomerRecord as RetailCustomerRecord,
  OdooPosBootstrap as RetailPosBootstrap,
  OdooPosCategoryRecord as RetailPosCategoryRecord,
  OdooProductRecord as RetailProductRecord,
} from "./odoo-api";