"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { OrithosLogo } from "@/components/OrithosLogo";
import { api, apiFailureMessage } from "@/lib/api";
import styles from "./signup.module.css";
import {
  isControlPlaneHost,
  isReservedSlug,
  normalizeSlug,
  storeOrigin,
  tenantBaseDomain,
} from "@/lib/tenant-host";

interface AvailableResponse {
  available: boolean;
  slug: string;
  previewHost?: string | null;
}

interface SignupResponse {
  redirectHost: string;
  bootstrapToken: string;
  subdomain: string;
}

export default function SignupPage() {
  const [organisationName, setOrganisationName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const slug = useMemo(() => normalizeSlug(subdomain), [subdomain]);
  const preview = slug ? `${slug}.${tenantBaseDomain()}` : `{store}.${tenantBaseDomain()}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isControlPlaneHost(window.location.host)) {
      setBlocked(true);
    }
  }, []);

  useEffect(() => {
    if (!slug || isReservedSlug(slug)) {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api.get<AvailableResponse>("/api/public/subdomain-available", { slug })
        .then((res) => { if (!cancelled) setAvailable(res.available); })
        .catch(() => { if (!cancelled) setAvailable(null); });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!slug || isReservedSlug(slug)) {
      setError("Choose a valid store subdomain.");
      return;
    }
    if (available === false) {
      setError("That subdomain is already taken.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<SignupResponse>("/api/public/signup", {
        organisationName: organisationName.trim(),
        subdomain: slug,
        ownerName: ownerName.trim() || username.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
      });
      const host = res.redirectHost || storeOrigin(res.subdomain);
      const url = new URL("/auth/bootstrap", host.endsWith("/") ? host : `${host}/`);
      url.searchParams.set("token", res.bootstrapToken);
      window.location.assign(url.toString());
    } catch (err) {
      setError(apiFailureMessage(err, "We couldn’t create your trial store.", "Session expired"));
    } finally {
      setBusy(false);
    }
  }

  if (blocked) {
    return (
      <main className={styles.blocked}>
        <OrithosLogo />
        <p>
          Start a free trial from the main Orithos app host, then we’ll open your store subdomain.
        </p>
        <Link href="/login">
          Back to sign in
        </Link>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <OrithosLogo />
      </div>

      <section className={styles.panel}>
        <aside className={styles.intro}>
          <div className={styles.introCopy}>
            <span className={styles.eyebrow}>YOUR STORE, RUN MORE CLEARLY</span>
            <h1>Make room for better retail.</h1>
            <p>Set up your Orithos workspace and bring your store operations together in one clear place.</p>
            <ul>
              <li><span aria-hidden="true">✓</span> A dedicated address for your store</li>
              <li><span aria-hidden="true">✓</span> Your own owner account</li>
              <li><span aria-hidden="true">✓</span> Ready to explore in minutes</li>
            </ul>
          </div>
          <div className={styles.storeImage} role="img" aria-label="Independent retailer using a point of sale at the counter">
            <span>Made for independent retail</span>
          </div>
        </aside>

        <div className={styles.formPane}>
          <header className={styles.formHeading}>
            <span className={styles.step}>CREATE YOUR WORKSPACE</span>
            <h2>Start your free trial</h2>
            <p>Tell us a little about your store to get started.</p>
          </header>

        <form onSubmit={onSubmit} className={styles.form}>
          <label className={styles.field}>
            <span>Store name</span>
            <input
              required
              value={organisationName}
              onChange={(e) => setOrganisationName(e.target.value)}
              maxLength={120}
              placeholder="Acme Cellars"
            />
          </label>

          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span>Store address</span>
            <div className={styles.subdomain}>
              <input
                required
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                maxLength={63}
                autoCapitalize="none"
                spellCheck={false}
                className={styles.subdomainInput}
                placeholder="acme"
              />
              <span className={styles.domainSuffix}>
                .{tenantBaseDomain()}
              </span>
            </div>
            <p className={styles.addressHint} aria-live="polite">
              <span>{preview}</span>
              {slug && available === true && <span className={styles.available}>Available</span>}
              {slug && available === false && <span className={styles.unavailable}>Already taken</span>}
              {slug && isReservedSlug(slug) && <span className={styles.unavailable}>Reserved</span>}
            </p>
          </label>

          <label className={styles.field}>
            <span>Your name</span>
            <input
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              maxLength={120}
            />
          </label>

          <label className={styles.field}>
            <span>Username</span>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              maxLength={120}
            />
          </label>

          <label className={styles.field}>
            <span>Email address</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
            />
          </label>

          <label className={styles.field}>
            <span>Password</span>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              placeholder="At least 12 characters"
            />
          </label>

          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span>Phone <small>Optional</small></span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={64}
            />
          </label>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || available === false}
            className={styles.submit}
          >
            {busy ? "Creating your store…" : "Create my store"}
            <span aria-hidden="true">→</span>
          </button>
        </form>

        <p className={styles.signIn}>
          Already have a store?{" "}
          <Link href="/login">
            Sign in
          </Link>
        </p>
        </div>
      </section>
      <p className={styles.footnote}>Secure setup · Your store data stays yours</p>
    </main>
  );
}
