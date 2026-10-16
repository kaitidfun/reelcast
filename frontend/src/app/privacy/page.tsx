import type { Metadata } from "next";
import Link from "next/link";
import PublicPage, { PolicyContent, type PolicySection } from "@/components/PublicPage";
import { siteUrl } from "@/lib/seo";
import { supportMailto } from "@/lib/support";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How ReelCast handles account information, uploaded content, connected accounts and performance data.",
  ...(siteUrl ? { alternates: { canonical: "/privacy" } } : {}),
};

const sections: PolicySection[] = [
  { id: "overview", title: "Overview", content: <p>ReelCast is a workspace for creating product videos, publishing to connected social platforms and reviewing performance. This policy describes the information processed when you use these features and the controls available to you.</p> },
  { id: "information", title: "Information we process", content: <ul>
    <li><strong className="text-foreground">Account information:</strong> your email address, display name, profile image, sign-in information and account security settings. Passwords created in ReelCast are stored as hashes.</li>
    <li><strong className="text-foreground">Workspace content:</strong> product details, affiliate URLs, campaign information, prompts, uploaded images and videos, and generated media and captions.</li>
    <li><strong className="text-foreground">Connected accounts:</strong> platform account identifiers, access and refresh tokens, publishing records and available social metrics, according to the permissions you grant.</li>
    <li><strong className="text-foreground">Link activity:</strong> tracking-link identifiers and visit timestamps. Request information, such as browser user-agent headers, is used to filter recognized bots and previews. Click totals represent visits, not purchases or unique people.</li>
    <li><strong className="text-foreground">Support information:</strong> the contact details, problem descriptions and attachments you choose to send us.</li>
  </ul> },
  { id: "use", title: "How information is used", content: <p>We use this information to authenticate you, maintain your workspace, generate and store media, carry out publishing actions you request, retrieve available performance metrics, provide reports, and investigate errors or support requests. Verification and password-reset emails support account access and security.</p> },
  { id: "providers", title: "Service providers & sharing", content: <><p>Features rely on hosting, storage, email, AI-generation and connected-platform services. Prompts and selected media are sent to the configured AI services to generate content. Media and captions are sent to social platforms when you request publication. Each external service handles information under its own terms and privacy policy.</p><p>Connecting Google or YouTube can provide profile information, authorization tokens and the channel or video information needed for the features you authorize. Review the permissions shown during connection. You can manage Google access in your <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">Google Account connections</a>. See also the <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.</p></> },
  { id: "storage", title: "Storage & retention", content: <><p>ReelCast uses browser local storage to retain your sign-in token. Signing out removes that token from the current browser. Clearing browser storage may sign you out, but does not delete your account or server-side content.</p><p>Workspace records and media are stored to support your use of the service. Removing an item from the workspace does not necessarily immediately erase every stored copy, backup or operational record. For account deletion or questions about retained data, <a href={supportMailto("ReelCast privacy and data deletion request")}>contact the ReelCast team</a> and identify the account and data concerned.</p></> },
  { id: "choices", title: "Your choices & requests", content: <><p>You can update available profile settings in Account, manage content in your workspace and disconnect social accounts in Connected accounts. Read the confirmation before disconnecting: it deletes the associated Distribution history. Disconnecting a platform does not remove posts already published on that platform; manage those directly with the platform.</p><p>For access, correction, export or deletion requests that are not available in the interface, use the <Link href="/support#contact">Support contacts</Link>. We may need to verify that the account belongs to you before handling a request. Do not email passwords, verification codes or access tokens.</p></> },
  { id: "updates", title: "Updates & contact", content: <p>We may update this page as ReelCast changes. The date above identifies the latest revision. For questions about this policy or how your information is handled, <Link href="/support#contact">contact the ReelCast team</Link>.</p> },
];

export default function PrivacyPage() {
  return <PublicPage active="/privacy" eyebrow="Your data, explained" title="Privacy Policy" description="Understand what information ReelCast uses, why it is needed, and how to manage your data."><PolicyContent sections={sections} /></PublicPage>;
}
