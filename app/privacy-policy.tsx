import { LegalDocScreen } from '@/components/legal/legal-doc-screen';
import { PRIVACY_POLICY_TEXT } from '@/lib/legal-content';

export default function PrivacyPolicyScreen() {
  return <LegalDocScreen title="Privacy Policy" content={PRIVACY_POLICY_TEXT} />;
}
