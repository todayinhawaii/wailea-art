import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-sand font-body text-ink">
      <SiteHeader />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-display text-4xl font-medium mb-2">Terms of Service</h1>
        <p className="text-ink/50 text-sm mb-10">Last updated August 11, 2026</p>

        <div className="bg-white rounded-xl2 border border-ink/5 shadow-sm p-8 sm:p-10 space-y-8 text-ink/80 leading-relaxed">
          <p>
            These Terms of Service ("Terms") are a binding legal agreement between you and Hula
            Forms ("Hula Forms," "we," "us," or "our") governing your access to and use of the
            Hula Forms website, application, and services (collectively, the "Service"). By
            creating an account, checking the box at signup, or otherwise using the Service, you
            agree to be bound by these Terms. If you don't agree, do not use the Service.
          </p>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">1. The Service</h2>
            <p>
              Hula Forms provides tools to build, publish, embed, and share online forms,
              including collecting electronic signatures and routing form responses by email.
              You are solely responsible for the content of any form you create, any agreement or
              contract language you include in a form, and how you use responses you collect. We
              are a software provider — we do not review, approve, draft, or provide legal advice
              regarding the content of your forms, and nothing in the Service constitutes legal
              advice.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">2. Your Account</h2>
            <p>
              You must provide accurate information when creating an account and keep your login
              credentials confidential. You are responsible for all activity that occurs under
              your account. Notify us immediately at support@hulaforms.com if you suspect
              unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">3. Subscription &amp; Billing</h2>
            <p>
              The Service is offered on a recurring monthly subscription basis, billed through
              our payment processor (Stripe). Subscriptions renew automatically until canceled.
              You may cancel at any time; your access continues through the end of the billing
              period already paid for. Fees are non-refundable except where required by law.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">4. Payments Collected Through Your Forms</h2>
            <p>
              The Service may let you ("Owner") collect payments directly from the people who
              fill out your forms ("Payers") using Stripe Connect. If you enable this feature,
              you connect your own independent Stripe account, and payments go directly from the
              Payer to your Stripe account. <strong>Hula Forms is not a party to these payments,
              does not process, hold, control, or have access to the funds at any point, and is
              not a bank, payment processor, money transmitter, or escrow agent.</strong> Our role
              is limited to providing the software that displays a payment field and hands the
              transaction to Stripe.
            </p>
            <p className="mt-3">
              By connecting a Stripe account through the Service, you separately agree to Stripe's
              own terms governing connected accounts, and you are responsible for complying with
              them, as well as any laws applicable to your business (including sales tax,
              licensing, and consumer protection requirements in your jurisdiction).
            </p>
            <p className="mt-3">
              You are solely responsible for: the goods or services described in your form;
              fulfilling those obligations to the Payer; setting accurate prices; and handling
              any refunds, cancellations, or disputes with your Payer directly. Hula Forms has no
              involvement in and no responsibility for the underlying transaction between you and
              your Payer, and is not liable for any dispute, chargeback, failed payment, delayed
              payout, or disagreement arising from it. We do not currently charge an additional
              fee on top of what Stripe charges for processing, but we reserve the right to
              introduce one in the future with reasonable notice.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">5. Your Content &amp; Data</h2>
            <p>
              You retain ownership of the forms you create and the responses you collect ("Your
              Content"). You grant Hula Forms a limited license to host, store, transmit, and
              display Your Content solely as necessary to operate and provide the Service to you
              (for example, emailing you a copy of a submitted response). You are responsible for
              having the right to collect and process any personal information you gather through
              your forms, and for complying with applicable privacy laws in how you use it.
            </p>
            <p className="mt-3">
              <strong>You are strongly encouraged to keep your own independent copies of
              important form responses, contracts, and signatures</strong> (for example, the PDF
              copies automatically emailed to you upon each submission). While we take reasonable
              measures to protect and back up data, no online service can guarantee against data
              loss, corruption, or unavailability, and you should not rely on the Service as your
              sole record-keeping system for anything you cannot afford to lose.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">6. Acceptable Use</h2>
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Collect information unlawfully, fraudulently, or without required consent from the people filling out your forms;</li>
              <li>Create forms or content that is illegal, defamatory, harassing, or infringes on another's rights;</li>
              <li>Attempt to interfere with, disrupt, or gain unauthorized access to the Service or other users' accounts or data;</li>
              <li>Use the Service to send spam or unsolicited bulk communications.</li>
            </ul>
            <p className="mt-3">
              We reserve the right to suspend or terminate any account that violates these Terms,
              with or without notice.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">7. Disclaimer of Warranties</h2>
            <p className="uppercase text-sm tracking-wide">
              The service is provided "as is" and "as available," without warranties of any kind,
              whether express, implied, or statutory, including without limitation warranties of
              merchantability, fitness for a particular purpose, non-infringement, or that the
              service will be uninterrupted, secure, error-free, or that any data loss will not
              occur.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">8. Limitation of Liability</h2>
            <p className="uppercase text-sm tracking-wide">
              To the fullest extent permitted by law, Hula Forms and its owner(s) shall not be
              liable for any indirect, incidental, special, consequential, or punitive damages, or
              any loss of data, revenue, profits, or business opportunities, arising out of or
              related to your use of the Service — including, without limitation, any loss,
              corruption, deletion, or unauthorized access to forms, form responses, signatures,
              images, or other content, and including any dispute, chargeback, failed transaction,
              delayed payout, or disagreement arising from a payment collected through your form —
              even if we have been advised of the possibility of such damages. In no event shall
              our total aggregate liability to you for any claim arising from or related to the
              Service exceed the total amount you paid us in the twelve (12) months immediately
              preceding the event giving rise to the claim.
            </p>
            <p className="mt-3">
              Some jurisdictions do not allow the exclusion or limitation of certain damages, so
              some of the above limitations may not apply to you.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">9. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless Hula Forms and its owner(s) from
              any claims, damages, losses, liabilities, and expenses (including reasonable
              attorneys' fees) arising out of or related to: (a) Your Content or the forms you
              create; (b) your use or misuse of the Service, including any payment you collect or
              attempt to collect through a form; (c) your violation of these Terms or of Stripe's
              own terms governing your connected account; or (d) your violation of any rights of a
              third party, including anyone who fills out your forms or pays through one.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">10. Termination</h2>
            <p>
              You may stop using the Service and cancel your subscription at any time from your
              billing settings. We may suspend or terminate your access to the Service at any
              time, with or without cause or notice, including for violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">11. Dispute Resolution — Binding Arbitration &amp; Class Action Waiver</h2>
            <p>
              You and Hula Forms agree that any dispute, claim, or controversy arising out of or
              relating to these Terms or the Service shall be resolved through final and binding
              arbitration, rather than in court, except that either party may bring an individual
              action in small claims court. <strong>You and Hula Forms each waive any right to a
              jury trial and to participate in a class action, class arbitration, or any
              representative action.</strong> Any arbitration will be conducted on an individual
              basis only.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">12. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the State of Hawaii, United States, without
              regard to its conflict-of-law principles, except as modified by the arbitration
              provision above.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">13. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. If we make material changes, we'll
              update the "Last updated" date above. Continuing to use the Service after changes
              take effect constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-medium text-ink mb-2">14. Contact</h2>
            <p>
              Questions about these Terms can be sent to{" "}
              <a href="mailto:support@hulaforms.com" className="text-ocean font-medium">support@hulaforms.com</a>.
            </p>
          </section>

          <p className="text-sm text-ink/50 pt-4 border-t border-ink/10">
            See also our <Link href="/privacy" className="text-ocean font-medium">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
