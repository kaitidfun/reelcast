import type { Metadata } from "next";
import Link from "next/link";
import PublicPage, { PolicyContent, type PolicySection } from "@/components/PublicPage";
import { siteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Guidelines for using ReelCast, creating AI content and publishing to connected social platforms.",
  ...(siteUrl ? { alternates: { canonical: "/terms" } } : {}),
};

const sections: PolicySection[] = [
  { id: "agreement", title: "Using ReelCast", content: <p>These terms apply to your use of ReelCast, including video creation, content management, social publishing and performance tracking. By creating an account or using the service, you agree to these terms. Please also read our <Link href="/privacy">Privacy Policy</Link> to understand how information is processed.</p> },
  { id: "account", title: "Your account", content: <p>Provide accurate account information and keep your sign-in details secure. You are responsible for actions you authorize through your account and for connecting only accounts you have permission to manage. If you suspect unauthorized access, change your password where available, review connected-platform permissions and <Link href="/support#contact">contact Support</Link>.</p> },
  { id: "content", title: "Your content & permissions", content: <><p>You retain the rights you hold in the content you upload. You give ReelCast permission to process, store, transform and transmit that content as needed to provide the features you request, including generation and publishing through service providers.</p><p>Only upload or publish material you are entitled to use, including product images, music, trademarks and images of people. Obtain any permissions required for your intended use. You are responsible for the accuracy of product claims, affiliate disclosures and published content.</p></> },
  { id: "ai", title: "AI-generated results", content: <p>AI-generated videos, images and text may contain errors, misleading details or results similar to other content. Review every output before publishing or relying on it. ReelCast does not guarantee that an output is accurate, unique or suitable for a particular purpose, or that you have exclusive rights to it.</p> },
  { id: "acceptable-use", title: "Acceptable use", content: <ul><li>Do not use ReelCast for unlawful, fraudulent, infringing or abusive content.</li><li>Do not impersonate others, misrepresent products or publish material without the required rights or consent.</li><li>Do not attempt unauthorized access, bypass security controls, distribute malicious code or disrupt the service.</li><li>Follow the rules and disclosure requirements of each platform where you publish, including rules for advertising, affiliate links and AI-generated media.</li></ul> },
  { id: "platforms", title: "Connected platforms & metrics", content: <><p>Third-party platforms control their own permissions, availability, publishing restrictions and data access. Connecting a platform does not guarantee successful publishing or continued access. Its terms and privacy policy also apply to your use of that platform.</p><p>Performance reports depend on available platform data and may be delayed or incomplete. Social metrics can represent lifetime totals observed during a selected period. Affiliate link clicks measure visits and do not establish sales, commissions or unique visitors. ReelCast does not guarantee reach, engagement or revenue.</p></> },
  { id: "availability", title: "Availability & responsibility", content: <p>Features may change or become temporarily unavailable because of maintenance, errors or external service changes. Keep independent copies of important content and reports. Access may be restricted to address misuse or security issues. Nothing in these terms is intended to remove rights or protections that cannot be excluded under applicable law.</p> },
  { id: "leaving", title: "Leaving & contacting us", content: <><p>You may stop using ReelCast at any time. Disconnect connected accounts when you no longer want ReelCast to access them, and manage previously published posts on the relevant platforms. For account or data deletion assistance, <Link href="/support#contact">contact the ReelCast team</Link>.</p><p>We may revise these terms as the service changes. Check the revision date on this page. Questions about these terms can be sent through <Link href="/support">Support</Link>.</p></> },
];

export default function TermsPage() {
  return <PublicPage active="/terms" eyebrow="The essentials" title="Terms of Service" description="A shared understanding of how to use ReelCast responsibly, from your first prompt to your next published Reel."><PolicyContent sections={sections} /></PublicPage>;
}
