export const supportContacts = ["chanagun_k@cmu.ac.th", "thippharake_na@cmu.ac.th"];

export function supportMailto(subject: string) {
  return `mailto:${supportContacts.join(",")}?subject=${encodeURIComponent(subject)}`;
}
