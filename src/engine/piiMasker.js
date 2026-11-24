/**
 * PDPA PII Masking Engine (AI Ethics & Data Privacy Guardrail)
 * Redacts personal phone numbers, Thai personal honorific names, LINE IDs, and emails
 * BEFORE sending unstructured text to external Cloud LLM APIs, then restores locally.
 */

export function maskPII(rawText = '') {
  const vault = [];
  let maskedText = rawText;

  let phoneIdx = 1;
  let lineIdx = 1;
  let personIdx = 1;

  // 1. Mask Thai mobile & landline numbers (e.g., 089-412-8831, 0812345678, 02-123-4567)
  maskedText = maskedText.replace(
    /(?:0[689]\d[-.\s]?\d{3}[-.\s]?\d{4}|02[-.\s]?\d{3}[-.\s]?\d{4})/g,
    (match) => {
      const token = `[PHONE_${String(phoneIdx++).padStart(2, '0')}]`;
      vault.push({ token, type: 'PHONE', original: match });
      return token;
    }
  );

  // 2. Mask LINE IDs (@handle) & emails
  maskedText = maskedText.replace(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|@[a-zA-Z0-9._-]{3,})/g,
    (match) => {
      const token = `[CONTACT_${String(lineIdx++).padStart(2, '0')}]`;
      vault.push({ token, type: 'CONTACT', original: match });
      return token;
    }
  );

  // 3. Mask explicit personal contact names after "คุณ" (keep shop names intact for geocoding context)
  maskedText = maskedText.replace(/คุณ([ก-๙a-zA-Z]{2,15})/g, (match) => {
    const token = `[PERSON_${String(personIdx++).padStart(2, '0')}]`;
    vault.push({ token, type: 'PERSON', original: match });
    return token;
  });

  return {
    rawText,
    maskedText,
    vault,
    maskedCount: vault.length,
  };
}

/**
 * Restores masked PII tokens back to their original values locally on the user's device.
 */
export function unmaskString(text = '', vault = []) {
  let result = String(text || '');
  for (const entry of vault) {
    result = result.split(entry.token).join(entry.original);
  }
  return result;
}
