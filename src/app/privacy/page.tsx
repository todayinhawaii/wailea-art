import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-sand font-body text-ink">
      <SiteHeader />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-display text-4xl font-medium mb-2">Privacy Policy</h1>
        <p className="text-ink/50 text-sm mb-10">Last updated August 11, 2026</p>

        <div className="bg-white rounded-xl2 border border-ink/5 shadow-sm p-8 sm:p-10 space-y-8 text-ink/80 leading-relaxed">
          <p>
            This Privacy Policy explains what information Hula Forms collects, how we use it, and
            the choices you have. By using Hula Forms, you agree to the practices described here.
          </p>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">1. Information We Collect</h2>
            <p className="mb-2"><strong>Account information:</strong> your name, email address, and a securely hashed password when you sign up.</p>
            <p className="mb-2"><strong>Billing information:</strong> handled directly by our payment processor, Stripe — we do not store your full card number.</p>
            <p><strong>Form content:</strong> the fields, banners, logos, and text you build into your forms, plus the responses (including names, addresses, and signatures) submitted by the people who fill them out.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">2. How We Use Information</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To operate, maintain, and provide the Service, including emailing you form responses and signed PDF copies;</li>
              <li>To process subscription payments and manage your account;</li>
              <li>To send account-related emails (password resets, security notices, and — if we ever offer them — product updates you can opt out of);</li>
              <li>To detect, prevent, and address fraud, abuse, or violations of our Terms of Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">3. Third-Party Services We Use</h2>
            <p>We rely on trusted third parties to operate Hula Forms, each with their own privacy practices:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Stripe</strong> — payment processing for your Hula Forms subscription, and — if you choose to connect a Stripe account — payment processing for payments you collect through your own forms. We never see or store full card numbers; Stripe handles that directly.</li>
              <li><strong>Resend</strong> — sending transactional emails (notifications, receipts, and form responses)</li>
              <li><strong>Render</strong> — application hosting and database storage</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">4. Data Retention</h2>
            <p>
              We retain your account and form data for as long as your account is active. If you
              delete a form, its responses are deleted along with it. If you'd like your account
              and associated data fully deleted, contact us at support@hulaforms.com.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">5. Your Choices</h2>
            <p>
              You can access, update, or delete your forms at any time from your dashboard. You
              can request a copy of your account data or full account deletion by emailing{" "}
              <a href="mailto:support@hulaforms.com" className="text-ocean font-medium">support@hulaforms.com</a>.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">6. Cookies</h2>
            <p>
              We use essential cookies to keep you securely logged in. We don't use third-party
              advertising or tracking cookies.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">7. Children's Privacy</h2>
            <p>
              The Service is not directed to children under 13, and we do not knowingly collect
              information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Material changes will be
              reflected by updating the "Last updated" date above.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">9. Contact</h2>
            <p>
              Questions about this Privacy Policy can be sent to{" "}
              <a href="mailto:support@hulaforms.com" className="text-ocean font-medium">support@hulaforms.com</a>.
            </p>
          </section>

          <p className="text-sm text-ink/50 pt-4 border-t border-ink/10">
            See also our <Link href="/terms" className="text-ocean font-medium">Terms of Service</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
