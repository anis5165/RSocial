import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const EFFECTIVE_DATE = '11 October 2026';
const LAST_UPDATED = '11 October 2026';

const privacyEmail = (import.meta.env.VITE_PRIVACY_CONTACT_EMAIL || 'routismofficials@gmail.com').trim();

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="text-lg font-semibold text-ink">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="border-b border-white/[0.08] bg-bg-soft">
        <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
          <div className="text-xs uppercase tracking-[0.2em] text-ink-muted">Routism Social</div>
          <p className="mt-0.5 text-sm text-ink-muted">Privacy Policy</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-ink-muted">
          Effective date: <time dateTime="2026-10-11">{EFFECTIVE_DATE}</time>
          <span className="mx-2 text-white/20" aria-hidden>
            ·
          </span>
          Last updated: <time dateTime="2026-10-11">{LAST_UPDATED}</time>
        </p>

        <div
          className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          role="note"
        >
          <p className="font-medium text-amber-50">Details to supply before relying on this page publicly</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-100/90">
            <li>
              Privacy contact email:{' '}
              {privacyEmail ? (
                <span className="text-ink">{privacyEmail}</span>
              ) : (
                <span>
                  not configured — set <code className="text-accent">VITE_PRIVACY_CONTACT_EMAIL</code> in
                  the dashboard environment
                </span>
              )}
            </li>
            {/* <li>
              Legal operator name and postal address for Routism / Routism Social —{' '}
              <strong className="font-medium text-amber-50">[to be supplied]</strong>
            </li> */}
          </ul>
        </div>

        <nav
          aria-label="Privacy policy sections"
          className="mt-8 rounded-xl border border-white/[0.08] bg-bg-card p-4 sm:p-5"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-ink-muted">On this page</p>
          <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {[
              ['introduction', '1. Introduction'],
              ['information-we-collect', '2. Information we collect'],
              ['instagram-authorization', '3. Instagram authorization'],
              ['how-we-use', '4. How we use information'],
              ['publishing', '5. Publishing and permissions'],
              ['storage-security', '6. Storage and security'],
              ['retention', '7. Retention'],
              ['sharing', '8. Sharing and third parties'],
              ['your-rights', '9. Your rights'],
              ['deletion', '10. Account and data deletion'],
              ['updates', '11. Updates to this policy'],
              ['contact', '12. Contact'],
            ].map(([hash, label]) => (
              <li key={hash}>
                <a href={`#${hash}`} className="text-ink hover:text-accent hover:underline">
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          <Section id="introduction" title="1. Introduction">
            <p>
              This Privacy Policy describes how Routism Social (“we”, “us”, or “the Service”) handles
              personal and account-related information when you use our social media scheduling and
              publishing platform associated with Routism.
            </p>
            <p>
              Routism Social helps you connect authorized social media accounts (currently Instagram),
              upload media, compose captions, schedule posts, and publish content through our web
              dashboard and, where enabled, through authorized integrations such as a remote Model
              Context Protocol (MCP) connection.
            </p>
            <p>
              This page is provided for transparency. It is not a certification of compliance with any
              specific privacy law, and it does not guarantee particular security outcomes. If you do
              not agree with this policy, please do not use the Service.
            </p>
          </Section>

          <Section id="information-we-collect" title="2. Information we collect">
            <p>Depending on how you use Routism Social, we may collect and process:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="text-ink">Account details</span> — such as name, email address,
                password (stored as a one-way hash), and timezone preferences.
              </li>
              <li>
                <span className="text-ink">Connected social media account information</span> — such as
                Instagram username, display name, platform account identifiers, connection status, and
                token expiry metadata needed to keep the connection working.
              </li>
              <li>
                <span className="text-ink">Post content and scheduling data</span> — captions, media
                references, schedule times, publish status, delivery results, and related preferences.
              </li>
              <li>
                <span className="text-ink">Uploaded media</span> — image files you upload for publishing,
                plus associated metadata (for example file type, dimensions if available, and storage
                URLs).
              </li>
              <li>
                <span className="text-ink">Session and authentication data</span> — session cookies used
                to keep you signed in to the dashboard, and, where MCP access is used, OAuth-related
                client and token records needed to authorize that connection.
              </li>
              <li>
                <span className="text-ink">Technical logs</span> — limited operational logs such as
                request identifiers, timestamps, error messages, and high-level activity needed to
                operate, debug, and secure the Service. We aim to avoid writing secrets (such as access
                tokens) into logs.
              </li>
            </ul>
            <p>
              We do not intentionally collect payment card data through Routism Social unless a future
              billing feature is added and disclosed separately.
            </p>
          </Section>

          <Section id="instagram-authorization" title="3. Instagram authorization and access tokens">
            <p>
              When you connect Instagram, you are redirected to Meta / Instagram to sign in and grant
              permissions. Meta returns an authorization code to our server callback URL. We exchange
              that code for access tokens according to Meta’s APIs and store what is needed to publish
              on your behalf.
            </p>
            <p>
              Access tokens are stored encrypted at rest using application-level encryption (AES-256-GCM)
              with a server-held encryption key. Tokens are decrypted only on the server when required
              to perform authorized actions such as refreshing a connection or publishing content you
              have instructed the Service to publish.
            </p>
            <p>
              You can disconnect a connected account in the dashboard. Disconnecting updates the
              connection status and replaces stored token material so the Service can no longer use the
              previous token for publishing. Revoking access in your Meta / Instagram settings is also
              recommended if you want Meta to stop authorizing the app.
            </p>
          </Section>

          <Section id="how-we-use" title="4. How we use information">
            <p>We use the information described above to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Create and authenticate your Routism Social account</li>
              <li>Connect and maintain authorized social media account links</li>
              <li>Store media, captions, and schedules you create</li>
              <li>Publish or schedule posts according to your instructions and permissions</li>
              <li>Power authorized MCP or API-style integrations you enable</li>
              <li>Provide account settings, status views, and delivery feedback</li>
              <li>Secure the Service, prevent abuse, and diagnose errors</li>
              <li>Respond to support or privacy requests you send us</li>
            </ul>
          </Section>

          <Section id="publishing" title="5. Publishing and authorized permissions">
            <p>
              Social media content is published only according to your instructions and the permissions
              you grant. Routism Social does not publish to your connected accounts unless you (or an
              integration you authorize, such as MCP acting for your authenticated user) request create,
              schedule, publish, or retry actions through the Service.
            </p>
            <p>
              Platform rules still apply. Meta / Instagram may refuse, delay, or limit publishing based
              on their own policies, rate limits, or account status. Routism Social cannot override those
              platform controls.
            </p>
          </Section>

          <Section id="storage-security" title="6. Data storage and security">
            <p>
              Account, scheduling, and connection records are stored in our application database. Uploaded
              media may be stored with our media hosting provider so that publish-ready URLs can be
              delivered to social platforms. Session cookies are used for dashboard authentication.
            </p>
            <p>
              We apply practical security measures appropriate to a production web service, including
              encrypted storage of social access tokens, hashed passwords, HTTPS in production
              deployments, cookie flags suited to secure sessions, and access controls in application
              code. No method of transmission or storage is completely secure, and we do not claim
              absolute protection against unauthorized access, loss, or alteration.
            </p>
          </Section>

          <Section id="retention" title="7. Retention">
            <p>
              We retain account data, connected-account metadata, posts, media references, and logs for
              as long as needed to operate the Service for you, maintain publish history you rely on, and
              meet legitimate operational needs (for example security investigation or abuse prevention).
            </p>
            <p>
              When you delete specific media or posts through available product controls, we remove or
              disconnect those records according to the product’s delete flows. Broader account or data
              deletion requests are handled as described in Section 10.
            </p>
          </Section>

          <Section id="sharing" title="8. Sharing and third-party providers">
            <p>We share information only as needed to run Routism Social, including with:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="text-ink">Meta / Instagram</span> — to authorize connections and publish
                content you request, subject to Meta’s terms and your granted permissions.
              </li>
              <li>
                <span className="text-ink">Cloudinary</span> — to host uploaded media used for
                publishing.
              </li>
              <li>
                <span className="text-ink">Hosting and infrastructure providers</span> — such as the
                platforms that host our web app, API, and database (for example frontend hosting, API
                hosting, and managed MySQL/MariaDB).
              </li>
              <li>
                <span className="text-ink">Service operators and support personnel</span> — only as
                needed to maintain the Service or respond to your requests.
              </li>
            </ul>
            <p>
              We do not sell your personal information. We may disclose information if required by law or
              to protect the rights, safety, or integrity of users, the Service, or others, where we
              believe disclosure is reasonably necessary.
            </p>
            <p>
              Third-party services process data under their own terms and privacy policies. Review those
              policies for Meta / Instagram, Cloudinary, and your hosting providers.
            </p>
          </Section>

          <Section id="your-rights" title="9. Your rights">
            <p>
              Subject to applicable law and what we can verify about your identity, you may request access
              to, correction of, or deletion of personal information we hold about your Routism Social
              account. You may also disconnect Instagram, update profile settings in the dashboard, and
              delete media or posts where the product provides those controls.
            </p>
            <p>
              To exercise a privacy-related request, use the contact method in Section 12. We may ask for
              information needed to verify that the request comes from the account holder.
            </p>
          </Section>

          <Section id="deletion" title="10. Account and data deletion requests">
            <p>
              To request account closure or deletion of associated personal data, contact us using the
              privacy email in Section 12 and include the email address registered to your Routism Social
              account. We will review the request and, after verification, delete or de-identify account
              data we control, except where we must retain limited records for security, dispute, or legal
              reasons.
            </p>
            <p>
              Deleting your Routism Social account does not automatically delete content already published
              to Instagram or other platforms. You may need to remove published posts directly on those
              platforms. Media copies held by third-party hosts may take additional time to fully clear
              according to those providers’ processes.
            </p>
          </Section>

          <Section id="updates" title="11. Updates to this policy">
            <p>
              We may update this Privacy Policy from time to time. When we do, we will revise the “Last
              updated” date at the top of this page and post the updated policy at{' '}
              <Link to="/privacy-policy" className="text-accent hover:underline">
                /privacy-policy
              </Link>
              . Material changes may also be communicated through the Service or by email when
              appropriate. Continued use of Routism Social after an update means you acknowledge the
              revised policy.
            </p>
          </Section>

          <Section id="contact" title="12. Contact">
            <p>
              For privacy questions, access requests, or deletion requests related to Routism Social,
              contact:
            </p>
            {privacyEmail ? (
              <p>
                <a
                  href={`mailto:${privacyEmail}`}
                  className="font-medium text-accent hover:underline"
                >
                  {privacyEmail}
                </a>
              </p>
            ) : (
              <p className="rounded-lg border border-white/[0.08] bg-bg-panel px-3 py-2 text-ink">
                Privacy contact email:{' '}
                {/* <strong className="font-medium">[to be supplied]</strong> — configure{' '} */}
                <code className="text-accent">VITE_PRIVACY_CONTACT_EMAIL</code> before treating this
                contact section as final.
              </p>
            )}
            {/* <p>
              Operator identity for notice purposes:{' '}
              <strong className="font-medium text-ink">[legal name and address to be supplied]</strong>.
            </p> */}
          </Section>
        </div>

        <footer className="mt-14 border-t border-white/[0.08] pt-6 text-sm text-ink-muted">
          <p>© {new Date().getFullYear()} Routism Social. All rights reserved.</p>
          <p className="mt-2">
            <Link to="/login" className="text-accent hover:underline">
              Back to sign in
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
