# Local Linkly adapter contract

Hardware Connect sends the validated Orithos transaction envelope to the local adapter:

- POST /v1/purchase: attemptId, orderUuid, connectorChallenge, amountCents, and currency.
- POST /v1/query: attemptId, orderUuid, and connectorChallenge.

For a confirmed adapter response, return HTTP 2xx with a JSON object containing status and optional providerReference. Example:

    {"status":"APPROVED","providerReference":"non-sensitive-terminal-reference"}

status is required and must be one of APPROVED, APPROVED_PENDING_SETTLEMENT, DECLINED, CANCELLED, or UNKNOWN, case-insensitively. providerReference is optional, limited to 256 characters, and must not contain PAN, track data, PIN data, or other cardholder authentication data. Do not return terminal/card payloads in this field.

On a valid response, Hardware Connect calls the configured Orithos API at POST /api/eftpos/connector/callback, supplying attemptId, connectorChallenge, status, and providerReference, authenticated with X-Orithos-Connector-Token. The Orithos API remains responsible for validating the token, challenge, attempt, and allowed state transition.

A non-2xx adapter response, invalid JSON, missing/unsupported status, oversized response, or failed Orithos callback is an unknown outcome. The connector attempts to record UNKNOWN where possible, returns HTTP 502 with reconciliation guidance, and the cashier must not dispatch another purchase until the terminal and Linkly journal are reconciled.

The adapter must make purchase dispatch idempotent by attemptId (and reject reuse with a different amount/order), retain queryable results long enough for reconciliation, and never convert a transport timeout into a decline. This contract is Orithos' normalized local adapter contract; it is not a Linkly IP Interface wire-protocol specification.
