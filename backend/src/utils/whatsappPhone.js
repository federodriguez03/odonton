const ARGENTINA_COUNTRY_CODE = '54';
const ARGENTINA_MOBILE_PREFIX = '9';

function invalidPhone(reason) {
  const error = new Error(`Teléfono inválido: ${reason}`);
  error.code = 'INVALID_WHATSAPP_PHONE';
  throw error;
}

function removeLocalMobilePrefix(nationalNumber) {
  if (nationalNumber.length !== 12) return nationalNumber;

  const candidates = [];
  for (const areaCodeLength of [2, 3, 4]) {
    if (nationalNumber.slice(areaCodeLength, areaCodeLength + 2) !== '15') continue;
    const candidate = `${nationalNumber.slice(0, areaCodeLength)}${nationalNumber.slice(areaCodeLength + 2)}`;
    if (/^[1-9]\d{9}$/.test(candidate)) candidates.push(candidate);
  }

  const uniqueCandidates = [...new Set(candidates)];
  if (uniqueCandidates.length !== 1) {
    invalidPhone('el prefijo local 15 es inexistente o ambiguo');
  }

  return uniqueCandidates[0];
}

function normalizePhoneToChatId(phone) {
  const raw = String(phone || '').trim();
  if (raw.endsWith('@c.us') || raw.endsWith('@lid')) return raw;
  if (!raw) invalidPhone('no se informó ningún número');
  if (!/^\+?[\d\s().-]+$/.test(raw)) {
    invalidPhone('contiene caracteres no admitidos');
  }

  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith(`0${ARGENTINA_COUNTRY_CODE}`)) digits = digits.slice(1);

  let nationalNumber;
  if (digits.startsWith(ARGENTINA_COUNTRY_CODE)) {
    nationalNumber = digits.slice(ARGENTINA_COUNTRY_CODE.length);
    if (nationalNumber.startsWith(ARGENTINA_MOBILE_PREFIX)) {
      nationalNumber = nationalNumber.slice(ARGENTINA_MOBILE_PREFIX.length);
    }
    if (nationalNumber.startsWith('0')) nationalNumber = nationalNumber.slice(1);
  } else {
    nationalNumber = digits;
    if (nationalNumber.startsWith('0')) nationalNumber = nationalNumber.slice(1);
    if (nationalNumber.length === 11 && nationalNumber.startsWith(ARGENTINA_MOBILE_PREFIX)) {
      nationalNumber = nationalNumber.slice(ARGENTINA_MOBILE_PREFIX.length);
    }
  }

  nationalNumber = removeLocalMobilePrefix(nationalNumber);
  if (!/^[1-9]\d{9}$/.test(nationalNumber)) {
    invalidPhone('debe contener un número nacional argentino de 10 dígitos');
  }

  return `${ARGENTINA_COUNTRY_CODE}${ARGENTINA_MOBILE_PREFIX}${nationalNumber}@c.us`;
}

module.exports = {
  normalizePhoneToChatId,
};
