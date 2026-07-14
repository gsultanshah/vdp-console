import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Use | Voter Data Processor',
  description:
    'Terms and conditions for using Voter Data Processor web console and mobile field app.',
};

const LAST_UPDATED = '15 July 2026';

export default function TermsOfUsePage() {
  return (
    <LegalPage
      title="Terms of Use"
      description="These terms govern access to and use of Voter Data Processor (VDP Console and VDP Mobile). By creating an account or using the service, you agree to these terms on behalf of yourself or the campaign organization you represent."
      lastUpdated={LAST_UPDATED}
      relatedLink={{ href: '/privacy-policy', label: 'Privacy Policy' }}
      sections={[
        {
          title: 'Acceptance of terms',
          paragraphs: [
            'By accessing or using VDP, you confirm that you have authority to bind your campaign organization to these Terms of Use and that you will comply with them. If you do not agree, do not use the service.',
          ],
        },
        {
          title: 'The service',
          paragraphs: [
            'VDP provides tools to digitize, search, organize, export, and print voter list information, and to provision mobile access for field teams. Features may change over time as we improve the platform.',
            'We strive to keep the service available and accurate, but we do not guarantee uninterrupted access or that every voter record will be error-free. Your campaign should verify critical information before relying on it for outreach or polling-day operations.',
          ],
        },
        {
          title: 'Accounts and access',
          paragraphs: [
            'Web console accounts are created by authorized administrators. You are responsible for safeguarding login credentials and for all activity under your account.',
            'Mobile field access uses short codes tied to a constituency and optional block restrictions. Administrators must issue codes only to trusted workers and disable codes when no longer needed.',
          ],
        },
        {
          title: 'Acceptable use',
          paragraphs: ['You agree not to use VDP to:'],
          bullets: [
            'Violate applicable election, privacy, or data-protection laws.',
            'Harass, intimidate, or misuse voter personal information.',
            'Share login credentials or mobile access codes with unauthorized persons.',
            'Attempt to breach, probe, or disrupt the platform or other users\' data.',
            'Upload malicious files or content unrelated to legitimate campaign operations.',
            'Resell or sublicense the service without written permission.',
          ],
        },
        {
          title: 'Campaign data',
          paragraphs: [
            'Your campaign retains responsibility for voter data uploaded into VDP, including obtaining any permissions required to process that data. You grant us a limited license to host, process, and display the data solely to provide the service to your organization.',
            'You must not upload data you do not have the right to use. We may suspend access if we reasonably believe data was obtained or is being used unlawfully.',
          ],
        },
        {
          title: 'Intellectual property',
          paragraphs: [
            'VDP software, branding, documentation, and design elements are owned by us or our licensors. These Terms do not grant you ownership of the platform—only a limited right to use it according to your subscription or granted access.',
            'Campaign branding assets you upload (for example logos used on parchi or the mobile app) remain yours. You represent that you have the right to use those assets.',
          ],
        },
        {
          title: 'Billing and subscriptions',
          paragraphs: [
            'If your organization uses paid features, fees and payment terms are set out in your agreement or invoice. Usage-based charges may apply for activities such as voter processing, exports, or parchi generation as described in your billing dashboard.',
            'Failure to pay applicable fees may result in suspension of service after reasonable notice.',
          ],
        },
        {
          title: 'Disclaimer',
          paragraphs: [
            'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" TO THE MAXIMUM EXTENT PERMITTED BY LAW. WE DISCLAIM WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE ARE NOT RESPONSIBLE FOR DECISIONS YOUR CAMPAIGN MAKES BASED ON DATA IN THE SYSTEM.',
          ],
        },
        {
          title: 'Limitation of liability',
          paragraphs: [
            'TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS OR DATA, ARISING FROM YOUR USE OF VDP. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE IS LIMITED TO THE AMOUNT YOUR ORGANIZATION PAID US FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE CLAIM, OR ONE HUNDRED US DOLLARS IF NO FEES WERE PAID.',
          ],
        },
        {
          title: 'Suspension and termination',
          paragraphs: [
            'We may suspend or terminate access if you breach these Terms, if required by law, or if continued service poses a security or legal risk. Your campaign may stop using the service at any time; administrators can deactivate users and codes through the console.',
          ],
        },
        {
          title: 'Changes',
          paragraphs: [
            'We may update these Terms from time to time. Continued use after the updated Terms are posted constitutes acceptance of the changes. Material updates will be reflected on this page with a revised "Last updated" date.',
          ],
        },
        {
          title: 'Governing law',
          paragraphs: [
            'These Terms are governed by the laws of Pakistan, without regard to conflict-of-law principles. Disputes should first be raised with your account administrator or our support channel so we can attempt to resolve them informally.',
          ],
        },
        {
          title: 'Contact',
          paragraphs: [
            'Questions about these Terms should be directed to the organization that manages your VDP account or the support contact provided with your subscription.',
          ],
        },
      ]}
    />
  );
}
