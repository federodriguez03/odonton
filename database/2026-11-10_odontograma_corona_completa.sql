BEGIN;

INSERT INTO odontograma_referencias (codigo, nombre, color, alcance, activo)
VALUES ('corona_completa', 'Corona completa', '#f59e0b', 'pieza', TRUE)
ON CONFLICT (codigo) DO NOTHING;

UPDATE odontograma_referencias
SET activo = FALSE, updated_at = NOW()
WHERE codigo = 'corona';

COMMIT;
