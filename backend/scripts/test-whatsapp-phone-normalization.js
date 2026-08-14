const assert = require('node:assert/strict');
const { normalizePhoneToChatId } = require('../src/utils/whatsappPhone');

const validCases = [
  ['5493511234567', '5493511234567@c.us'],
  ['+54 9 351 1234567', '5493511234567@c.us'],
  ['3511234567', '5493511234567@c.us'],
  ['03511234567', '5493511234567@c.us'],
  ['351151234567', '5493511234567@c.us'],
  ['0351151234567', '5493511234567@c.us'],
  ['0351 15 1234567', '5493511234567@c.us'],
  ['351 15 1234567', '5493511234567@c.us'],
  ['5493511234567@c.us', '5493511234567@c.us'],
  ['123456789012345@lid', '123456789012345@lid'],
];

const invalidCases = [
  '',
  '351123',
  '55 11 91234 5678',
  '351-ABC-1234567',
  '351991234567',
];

for (const [input, expected] of validCases) {
  assert.equal(normalizePhoneToChatId(input), expected, input);
}

for (const input of invalidCases) {
  assert.throws(
    () => normalizePhoneToChatId(input),
    (error) => error?.code === 'INVALID_WHATSAPP_PHONE',
    input || '<vacío>',
  );
}

console.log(`Normalización WhatsApp correcta: ${validCases.length} válidos, ${invalidCases.length} inválidos.`);
