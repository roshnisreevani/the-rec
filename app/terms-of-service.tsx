import { LegalDocScreen } from '@/components/legal/legal-doc-screen';
import { TERMS_OF_SERVICE_TEXT } from '@/lib/legal-content';

export default function TermsOfServiceScreen() {
  return <LegalDocScreen title="Terms of Service" content={TERMS_OF_SERVICE_TEXT} />;
}
