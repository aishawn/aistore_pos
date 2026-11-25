# Linkly TCP/IP integration

Orithos can connect directly to the Linkly EFT-Client TCP/IP interface. This is the same documented interface category Shopfront's public setup article points toward, but Shopfront also requires its separately licensed Shopfront Client Connector; its private connector implementation is not public.

## Configuration

The connector probes `127.0.0.1:2011` first (Linkly's documented default), then `127.0.0.1:2005` for older PC-EFTPOS installations. Override with:

```text
ORITHOS_LINKLY_TCP_HOST=127.0.0.1
ORITHOS_LINKLY_TCP_PORT=2011
```

An explicit HTTP adapter setting (`ORITHOS_LINKLY_ADAPTER_BASE`, or the legacy `ORITHOS_LINKLY_TCP_BASE`) takes precedence. TCP mode is only selected when no HTTP adapter is configured and a TCP listener is reachable.

In the Linkly EFT-Client, enable the TCP/IP Listen Socket and allow the local POS process in the IP Interface access list. Linkly's default port is documented as 2011; the EFT-Client registry setting is `HKEY_LOCAL_MACHINE\\SOFTWARE\\CullenSoftwareDesign\\EFTCLIENT\\CLIENT\\IP_INTERFACE_PORT`.

## Supported flow

- Purchase sends the documented `#` + four-digit total frame length + fixed-width `M0` transaction request, using AUD cents and a stable Orithos attempt reference.
- Query sends `Get Last Transaction (N)` with the same reference. The result is accepted only when Linkly returns that exact TxnRef; otherwise it is `UNKNOWN`.
- A transport timeout, malformed frame, unsupported event, unmatched query, or callback failure is never reported as a decline or approval. The attempt is marked `UNKNOWN` where possible and the cashier must not retry until the terminal and Linkly journal are reconciled.
- The interface's general cancel behavior is not implemented as a confirmed financial reversal. Do not treat browser cancellation as proof that the terminal did not approve.

## Verification boundary

Port reachability confirms only that a TCP listener accepts a connection. It does not prove the EFT-Client version, acquirer configuration, terminal readiness, or end-to-end payment behavior. The local fake TCP test validates framing and field mapping; real payment acceptance requires Linkly/acquirer certification and an explicitly authorized low-value transaction with terminal, Linkly journal, Orithos order, and attempt reconciled.

References:

- [Shopfront: Linkly Integrated EFTPOS](https://support.onshopfront.com/hc/en-us/articles/26670478389517-Linkly-Integrated-EFTPOS)
- [Linkly TCP/IP API reference](https://www.linkly.com.au/apidoc/TCPIP/index.html)
