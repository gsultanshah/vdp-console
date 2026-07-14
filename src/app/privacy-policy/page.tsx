import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy | Voter Data Processor',
  description:
    'How Voter Data Processor collects, uses, and protects voter and campaign data on the web console and mobile app.',
};

const LAST_UPDATED = '15 July 2026';

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="This policy explains what information we handle when you use Voter Data Processor (VDP Console and VDP Mobile), how we use it, and the choices available to your campaign."
      lastUpdated={LAST_UPDATED}
      relatedLink={{ href: '/terms-of-use', label: 'Terms of Use' }}
      sections={[
        {
          title: 'Who we are',
          paragraphs: [
            'Voter Data Processor ("VDP", "we", "us") provides software for election campaigns to organize, search, and use voter list information. Our services include the VDP web console and the VDP Mobile field app.',
            'Your campaign organization is responsible for how voter data is collected and used in compliance with applicable laws. We provide the platform; you control the accounts, access codes, and data loaded into the system.',
          ],
        },
        {
          title: 'Information we process',
          paragraphs: [
            'Depending on how your campaign uses VDP, we may process the following categories of information:',
          ],
          bullets: [
            'Account details for web console users (name, email, role, constituency access).',
            'Mobile field access records (worker name, phone, address, comments, assigned block codes, usage logs).',
            'Voter list data uploaded or processed by your campaign (for example CNIC, name, address, block code, household number, polling details, and scanned list images).',
            'Operational data such as export jobs, parchi generation history, and activity timestamps.',
            'Optional device and location information when field workers allow location sharing in the mobile app.',
            'Technical logs needed to operate and secure the service (IP address, browser or app version, error reports).',
          ],
        },
        {
          title: 'How we use information',
          paragraphs: [
            'We use information only to provide, maintain, and improve the VDP services your campaign has subscribed to or been granted access to. This includes voter search, household lookup, parchi printing, offline block downloads, reporting, and administrative controls.',
            'We do not sell voter data or campaign contact lists to third parties for marketing purposes.',
          ],
        },
        {
          title: 'How information is shared',
          paragraphs: [
            'Access within your campaign is limited by the roles and permissions your administrators configure. Field workers with a mobile access code only see voters for the constituency and blocks assigned to that code.',
            'We may use trusted infrastructure providers (for example cloud hosting, storage, and email delivery) strictly to run the service. Those providers process data on our instructions and are not permitted to use your campaign data for their own purposes.',
            'We may disclose information if required by law, court order, or to protect the rights, safety, and security of users and the platform.',
          ],
        },
        {
          title: 'Data retention',
          paragraphs: [
            'Campaign data remains in the system for as long as your organization maintains an active account or as needed to provide the service. Administrators may delete or deactivate users, access codes, and constituencies according to the tools available in the console.',
            'When accounts or records are deleted, we apply reasonable retention and archival practices before permanent removal from active systems.',
          ],
        },
        {
          title: 'Security',
          paragraphs: [
            'We use administrative, technical, and organizational measures designed to protect information against unauthorized access, alteration, or loss. No method of transmission or storage is completely secure; your campaign should also follow good practices such as limiting access codes, using strong passwords, and removing workers who no longer need access.',
          ],
        },
        {
          title: 'Your responsibilities',
          paragraphs: [
            'As a campaign customer, you are responsible for ensuring that voter data is obtained and used lawfully, that staff are trained on appropriate use, and that access is granted only to people who need it for legitimate campaign activities.',
          ],
        },
        {
          title: 'Children',
          paragraphs: [
            'VDP is intended for use by campaign organizations and their authorized staff. It is not directed at children, and we do not knowingly collect personal information from children.',
          ],
        },
        {
          title: 'Changes to this policy',
          paragraphs: [
            'We may update this Privacy Policy from time to time. When we make material changes, we will post the updated policy on this page and revise the "Last updated" date above.',
          ],
        },
        {
          title: 'Contact',
          paragraphs: [
            'If you have questions about this Privacy Policy or how your campaign\'s data is handled, contact your VDP account administrator or the organization that provisioned your access.',
          ],
        },
      ]}
    />
  );
}
